"""Runs a job. Locally: a background thread. In the cloud: API -> SQS -> worker Lambda."""
from __future__ import annotations

import json
import os
import threading
import time
import traceback

from .engines import get_engine
from .pipeline import run_pipeline
from .scenarios import BY_ID
from .store import get_store, now


def run_job(job_id: str, store=None, engine=None, llm_key: str | None = None) -> None:
    store = store or get_store()
    job = store.get(job_id)
    if not job:
        return
    store.update(job_id, status="running")

    delay = float(os.getenv("SRE_DEMO_DELAY", "0") or 0)  # slows the offline engine so the UI timeline is watchable

    def emit(agent: str, kind: str, text: str) -> None:
        store.add_step(job_id, {"ts": now(), "agent": agent, "kind": kind, "text": text})
        if delay:
            time.sleep(delay)

    try:
        result = run_pipeline(BY_ID[job["scenario_id"]], engine or get_engine(llm_key), emit)
        store.update(job_id, status="awaiting_approval", result=result)
    except Exception as e:  # never leave a job stuck in 'running'
        traceback.print_exc()
        store.update(job_id, status="failed", error=f"{type(e).__name__}: {e}")


def submit_job(job_id: str, llm_key: str | None = None) -> None:
    region = os.getenv("DEFAULT_AWS_REGION", "eu-west-1")
    worker = os.getenv("WORKER_FUNCTION")
    queue = os.getenv("SQS_QUEUE_URL")
    if llm_key and worker:
        # BYOK in the cloud: a direct async invoke carries the key to the worker without it ever
        # being written to a queue, table or log.
        import boto3

        boto3.client("lambda", region_name=region).invoke(
            FunctionName=worker, InvocationType="Event",
            Payload=json.dumps({"job_id": job_id, "llm_key": llm_key}).encode(),
        )
    elif queue:
        import boto3

        boto3.client("sqs", region_name=region).send_message(QueueUrl=queue, MessageBody=json.dumps({"job_id": job_id}))
    else:
        threading.Thread(target=run_job, args=(job_id,), kwargs={"llm_key": llm_key}, daemon=True).start()
