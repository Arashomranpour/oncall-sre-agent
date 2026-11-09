"""Read-only investigation tools. The agent can look at an incident but cannot change anything."""
from __future__ import annotations

import json

from .guardrails import scan_untrusted, wrap_untrusted

TOOL_SPECS = [
    {
        "type": "function",
        "function": {
            "name": "get_logs",
            "description": "Read recent log lines for the alarmed service. Optional case-insensitive text filter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Only lines containing this text"},
                    "limit": {"type": "integer", "description": "Max lines (default 40)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_metrics",
            "description": "Read CloudWatch-style metric series around the alarm.",
            "parameters": {"type": "object", "properties": {"metric": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_changes",
            "description": "List recent infrastructure/code changes (id, time, author, file, summary, diff).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


class SREEnvironment:
    """The only window the agents have onto an incident. Ground truth is never exposed here."""

    def __init__(self, scenario: dict):
        self._s = scenario
        self.alarm = scenario["alarm"]
        self.injection_lines: list[str] = []

    def _clean(self, text: str, source: str) -> str:
        clean, flagged = scan_untrusted(text)
        for f in flagged:
            if f not in self.injection_lines:
                self.injection_lines.append(f)
        return wrap_untrusted(clean, source)

    def get_logs(self, query: str = "", limit: int = 40) -> str:
        lines = self._s["logs"]
        if query:
            lines = [ln for ln in lines if query.lower() in ln.lower()]
        return self._clean("\n".join(lines[-int(limit or 40):]), "logs")

    def get_metrics(self, metric: str = "") -> str:
        rows = []
        for name, m in self._s["metrics"].items():
            if metric and metric.lower() not in name.lower():
                continue
            pts = ", ".join(f"{t[11:16]}={v}" for t, v in m["points"])
            rows.append(f"{name} ({m['unit']}): {pts}")
        return wrap_untrusted("\n".join(rows) or "no matching metric", "metrics")

    def changes_data(self) -> list[dict]:
        return [
            {k: c[k] for k in ("id", "ts", "author", "file", "summary", "diff")}
            for c in self._s["changes"]
        ]

    def get_recent_changes(self) -> str:
        return self._clean(json.dumps(self.changes_data(), indent=1), "changes")

    def call(self, name: str, args: dict) -> str:
        if name == "get_logs":
            return self.get_logs(args.get("query", ""), args.get("limit", 40))
        if name == "get_metrics":
            return self.get_metrics(args.get("metric", ""))
        if name == "get_recent_changes":
            return self.get_recent_changes()
        return f"unknown tool {name}"
