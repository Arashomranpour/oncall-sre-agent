# On-Call SRE Agent

A multi-agent on-call assistant. An alarm fires; agents **triage** it, **investigate** with read-only tools (logs, metrics, recent changes), and **propose a fix** as a pull-request draft. A human must approve before anything happens.

> Incidents are **simulated** (30 scenarios with known root causes) so the agents can be scored. Fixes are proposals; the "PR" on approval is simulated.

## What it shows

- **Agents:** Triage (JSON output), Investigator (tool calling), Fixer (JSON output). Structured output and tools are never mixed in one agent.
- **Human in the loop:** nothing is applied without approval, and a blocked patch cannot be approved.
- **Evals as a CI gate:** `python -m sre.evals` scores root-cause accuracy, culprit-change accuracy, latency and cost over 30 incidents, and fails the build below a threshold.
- **Safety:** 3 incidents carry a prompt-injection line in the logs. Pattern-based scanning strips it, agents have no write tools, and patches are checked for destructive content. The scan is pattern-based, so the approval gate is the real backstop.
- **Cloud (written, not deployed):** Terraform for DynamoDB, SQS + DLQ, two Lambdas, API Gateway, S3 + CloudFront, and a GitHub OIDC deploy role.

## Run locally

```bash
# backend (port 8000)
cd backend
uv sync --python 3.12 --extra dev
SRE_DEMO_DELAY=0.7 uv run uvicorn sre.api:app --port 8000

# frontend (port 3000, or the next free port)
cd frontend
npm install
npm run dev
```

Without a key the **offline rule-based engine** runs. It is a baseline, not an LLM; its scores only prove the harness works.

### Live LLM agents

Copy `.env.example` to `.env` (gitignored) and set `LLM_MODEL` and `GROQ_API_KEY`, then install the extra:

```bash
cd backend && uv sync --python 3.12 --extra dev --extra live
uv run python -m sre.evals        # real agent numbers
```

## Tests and evals

```bash
cd backend
uv run pytest -q
SRE_ENGINE=offline uv run python -m sre.evals --min-accuracy 0.8
```

## Deploy (not done yet)

Each Terraform module is independent, applied in order: `1_data`, `2_backend`, `3_frontend`, `4_cicd`. Build the backend zip first with `uv run python package_lambda.py`. Always `terraform plan -out=tfplan`, read it, then `terraform apply tfplan`. Never commit `.env`, `*.tfvars` or state files.

## Layout

```
backend/sre/      scenarios, tools, guardrails, engines, pipeline, store, api, evals
backend/tests/    13 tests (pipeline, guardrails, injection, API flow, auth)
frontend/         Next.js static export: Dashboard, Incident, Evals
terraform/        1_data, 2_backend, 3_frontend, 4_cicd
.github/workflows CI (tests, eval gate, build, terraform validate) + deploy workflows
```
