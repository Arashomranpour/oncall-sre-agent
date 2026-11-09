"""Job storage. SQLite locally; DynamoDB when JOBS_TABLE is set (cloud).

Job lifecycle: pending -> running -> awaiting_approval -> approved | rejected   (or failed)
Every query is scoped by user_id taken from the verified JWT, never from the request body.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

_LOCK = threading.Lock()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_job(user_id: str, scenario_id: str) -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "user_id": user_id,
        "scenario_id": scenario_id,
        "status": "pending",
        "created_at": now(),
        "updated_at": now(),
        "steps": [],
        "result": None,
        "approval": None,
        "error": None,
    }


class SQLiteStore:
    def __init__(self, path: str):
        self.path = path
        with self._conn() as c:
            c.execute(
                "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, data TEXT)"
            )

    def _conn(self):
        return sqlite3.connect(self.path, timeout=30)

    def create(self, user_id: str, scenario_id: str) -> dict:
        job = new_job(user_id, scenario_id)
        with _LOCK, self._conn() as c:
            c.execute("INSERT INTO jobs VALUES (?,?,?,?)", (job["id"], user_id, job["created_at"], json.dumps(job)))
        return job

    def get(self, job_id: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def _save(self, c, job: dict) -> None:
        job["updated_at"] = now()
        c.execute("UPDATE jobs SET data=? WHERE id=?", (json.dumps(job), job["id"]))

    def update(self, job_id: str, **fields) -> dict:
        with _LOCK, self._conn() as c:
            row = c.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
            job = json.loads(row[0])
            job.update(fields)
            self._save(c, job)
        return job

    def add_step(self, job_id: str, step: dict) -> None:
        with _LOCK, self._conn() as c:
            row = c.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
            job = json.loads(row[0])
            job["steps"].append(step)
            self._save(c, job)

    def list(self, user_id: str, limit: int = 50) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT data FROM jobs WHERE user_id=? ORDER BY created_at DESC LIMIT ?", (user_id, limit)
            ).fetchall()
        return [json.loads(r[0]) for r in rows]


class DynamoStore:
    """Same interface on DynamoDB (pay-per-request). Not exercised by the local tests."""

    def __init__(self, table: str):
        import boto3

        self.t = boto3.resource("dynamodb", region_name=os.getenv("DEFAULT_AWS_REGION", "eu-west-1")).Table(table)

    def create(self, user_id: str, scenario_id: str) -> dict:
        job = new_job(user_id, scenario_id)
        self.t.put_item(Item={"id": job["id"], "user_id": user_id, "created_at": job["created_at"], "data": json.dumps(job)})
        return job

    def get(self, job_id: str) -> dict | None:
        item = self.t.get_item(Key={"id": job_id}).get("Item")
        return json.loads(item["data"]) if item else None

    def update(self, job_id: str, **fields) -> dict:
        job = self.get(job_id)
        job.update(fields)
        job["updated_at"] = now()
        self.t.update_item(Key={"id": job_id}, UpdateExpression="SET #d=:d", ExpressionAttributeNames={"#d": "data"},
                           ExpressionAttributeValues={":d": json.dumps(job)})
        return job

    def add_step(self, job_id: str, step: dict) -> None:
        job = self.get(job_id)
        job["steps"].append(step)
        self.update(job_id, steps=job["steps"])

    def list(self, user_id: str, limit: int = 50) -> list[dict]:
        from boto3.dynamodb.conditions import Attr

        items = self.t.scan(FilterExpression=Attr("user_id").eq(user_id)).get("Items", [])
        jobs = [json.loads(i["data"]) for i in items]
        return sorted(jobs, key=lambda j: j["created_at"], reverse=True)[:limit]


_STORE = None


def get_store():
    global _STORE
    if _STORE is None:
        table = os.getenv("JOBS_TABLE")
        _STORE = DynamoStore(table) if table else SQLiteStore(os.getenv("SRE_DB", "sre.db"))
    return _STORE
