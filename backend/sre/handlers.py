"""AWS Lambda entry points (cloud mode)."""
from __future__ import annotations

import json

from mangum import Mangum

from .api import app
from .runner import run_job

api_handler = Mangum(app, lifespan="off")


def worker_handler(event, _context):
    """SQS-triggered worker. Raises on failure so SQS retries and finally moves the message to the DLQ."""
    if "job_id" in event:  # direct async invoke from the API (bring-your-own-key run)
        run_job(event["job_id"], llm_key=event.get("llm_key"))
        return {"ok": True}
    for record in event.get("Records", []):
        run_job(json.loads(record["body"])["job_id"])
    return {"ok": True}
