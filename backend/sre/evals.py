"""Eval harness: run all 30 incidents and score the agents. Use as a CI quality gate.

    uv run python -m sre.evals                 # run and write evals/latest.json
    uv run python -m sre.evals --min-accuracy 0.8   # exit 1 when root-cause accuracy is below the gate
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from .engines import get_engine  # noqa: E402
from .pipeline import run_pipeline  # noqa: E402
from .scenarios import SCENARIOS  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "evals" / "latest.json"


def run_evals(limit: int | None = None) -> dict:
    engine = get_engine()
    rows = []
    for s in SCENARIOS[:limit]:
        try:
            r = run_pipeline(s, engine)
            inv = r["investigation"]
            row = {
                "scenario_id": s["id"],
                "service": s["alarm"]["service"],
                "truth_category": s["truth"]["category"],
                "pred_category": inv["root_cause_category"],
                "category_ok": inv["root_cause_category"] == s["truth"]["category"],
                "culprit_ok": inv.get("culprit_change_id") == s["truth"]["culprit_change_id"],
                "injected": s["injected"],
                "injection_detected": r["injection"]["detected"],
                "patch_blocked": r["fix"]["blocked"],
                "latency_s": r["metrics"]["latency_s"],
                "tokens": r["metrics"]["tokens"],
                "cost_usd": r["metrics"]["cost_usd"],
                "error": None,
            }
        except Exception as e:
            row = {"scenario_id": s["id"], "service": s["alarm"]["service"], "truth_category": s["truth"]["category"],
                   "pred_category": "error", "category_ok": False, "culprit_ok": False, "injected": s["injected"],
                   "injection_detected": False, "patch_blocked": False, "latency_s": 0, "tokens": 0, "cost_usd": 0,
                   "error": f"{type(e).__name__}: {e}"}
        rows.append(row)
        time.sleep(0.0 if engine.name.startswith("offline") else 0.5)

    n = len(rows)
    inj = [r for r in rows if r["injected"]]
    lat = sorted(r["latency_s"] for r in rows)
    summary = {
        "engine": engine.name,
        "total": n,
        "category_accuracy": round(sum(r["category_ok"] for r in rows) / n, 3),
        "culprit_accuracy": round(sum(r["culprit_ok"] for r in rows) / n, 3),
        "injection_cases": len(inj),
        "injection_detected": sum(r["injection_detected"] for r in inj),
        "injection_misled": sum((not r["category_ok"]) for r in inj),
        "patches_blocked": sum(r["patch_blocked"] for r in rows),
        "latency_p50_s": lat[n // 2],
        "latency_p95_s": lat[min(n - 1, int(n * 0.95))],
        "total_cost_usd": round(sum(r["cost_usd"] for r in rows), 5),
        "cost_per_incident_usd": round(sum(r["cost_usd"] for r in rows) / n, 6),
        "errors": sum(1 for r in rows if r["error"]),
        "note": ("Rule-based baseline, not an LLM. Run with a Groq key for real agent numbers."
                 if engine.name.startswith("offline") else "Live LLM agents."),
    }
    report = {"summary": summary, "rows": rows, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-accuracy", type=float, default=0.0)
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    rep = run_evals(a.limit)
    print(json.dumps(rep["summary"], indent=1))
    if rep["summary"]["category_accuracy"] < a.min_accuracy:
        print(f"FAIL: accuracy {rep['summary']['category_accuracy']} < gate {a.min_accuracy}")
        sys.exit(1)
