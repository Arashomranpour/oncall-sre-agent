"""FastAPI app. Auth: Clerk JWT when CLERK_JWKS_URL is set, otherwise a fixed dev user (local demo)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from .engines import get_engine  # noqa: E402
from .runner import submit_job  # noqa: E402
from .scenarios import BY_ID, SCENARIOS, public_view  # noqa: E402
from .store import get_store, now  # noqa: E402

app = FastAPI(title="On-Call SRE Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_jwk = None


def get_user_id(authorization: str | None = Header(default=None)) -> str:
    jwks_url = os.getenv("CLERK_JWKS_URL")
    if not jwks_url:
        return "dev-user"  # local demo mode, no Clerk configured
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(403, "Not authenticated")
    import jwt
    from jwt import PyJWKClient

    global _jwk
    _jwk = _jwk or PyJWKClient(jwks_url)
    token = authorization.split(" ", 1)[1]
    try:
        key = _jwk.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=os.getenv("CLERK_ISSUER") or None,
                            options={"verify_aud": False})
    except Exception:
        raise HTTPException(403, "Invalid token")
    return claims["sub"]


class RunRequest(BaseModel):
    scenario_id: str


class Decision(BaseModel):
    decision: str  # approve | reject


def _own_job(job_id: str, user_id: str) -> dict:
    job = get_store().get(job_id)
    if not job or job["user_id"] != user_id:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/api/health")
def health():
    engine = get_engine()
    return {"ok": True, "engine": engine.name, "auth": "clerk" if os.getenv("CLERK_JWKS_URL") else "dev-demo"}


@app.get("/api/scenarios")
def scenarios(_: str = Depends(get_user_id)):
    return [public_view(s) for s in SCENARIOS]


@app.post("/api/jobs")
def create_job(req: RunRequest, user_id: str = Depends(get_user_id), x_llm_key: str | None = Header(default=None)):
    if req.scenario_id not in BY_ID:
        raise HTTPException(404, "Unknown scenario")
    job = get_store().create(user_id, req.scenario_id)
    submit_job(job["id"], (x_llm_key or "").strip() or None)  # BYOK header: used for this run only
    return job


@app.get("/api/jobs")
def list_jobs(user_id: str = Depends(get_user_id)):
    return [{k: j[k] for k in ("id", "scenario_id", "status", "created_at", "updated_at")}
            | {"alarm": BY_ID[j["scenario_id"]]["alarm"],
               "root_cause": (j.get("result") or {}).get("investigation", {}).get("root_cause_category")}
            for j in get_store().list(user_id)]


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user_id: str = Depends(get_user_id)):
    job = _own_job(job_id, user_id)
    job["alarm"] = BY_ID[job["scenario_id"]]["alarm"]
    return job


@app.post("/api/jobs/{job_id}/decision")
def decide(job_id: str, body: Decision, user_id: str = Depends(get_user_id)):
    job = _own_job(job_id, user_id)
    if body.decision not in ("approve", "reject"):
        raise HTTPException(422, "decision must be approve or reject")
    if job["status"] != "awaiting_approval":
        raise HTTPException(409, f"Job is {job['status']}, not awaiting approval")
    fix = (job.get("result") or {}).get("fix") or {}
    if body.decision == "approve" and fix.get("blocked"):
        raise HTTPException(409, "Patch was blocked by guardrails and cannot be approved")
    if body.decision == "approve" and not fix.get("patch"):
        raise HTTPException(409, "No patch to approve")
    approval = {"decision": body.decision, "by": user_id, "at": now()}
    if body.decision == "approve":
        # Simulated: a real deployment would open the PR through the GitHub API here.
        approval["pr_url"] = f"https://github.com/acme/infra/pull/{1000 + int(job['id'][:4], 16) % 900}"
        approval["pr_simulated"] = True
    status = "approved" if body.decision == "approve" else "rejected"
    return get_store().update(job_id, status=status, approval=approval)


@app.get("/api/evals/latest")
def latest_evals(_: str = Depends(get_user_id)):
    p = Path(__file__).resolve().parents[1] / "evals" / "latest.json"
    if not p.exists():
        raise HTTPException(404, "No eval run yet. Run: uv run python -m sre.evals")
    return json.loads(p.read_text(encoding="utf-8"))
