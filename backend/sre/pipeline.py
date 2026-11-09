"""Triage -> Investigator -> Fixer pipeline. Shared by the API worker and the eval harness."""
from __future__ import annotations

import time
from typing import Callable

from .guardrails import check_patch
from .scenarios import CATEGORY_IDS
from .tools import SREEnvironment

Emit = Callable[[str, str, str], None]


def _noop(*_a) -> None:
    return None


def run_pipeline(scenario: dict, engine, emit: Emit = _noop) -> dict:
    t0 = time.time()
    tokens0, cost0 = engine.tokens, engine.cost
    env = SREEnvironment(scenario)
    emit("system", "info", f"Alarm {scenario['alarm']['name']} fired on {scenario['alarm']['service']}.")

    triage = engine.triage(env, emit)
    inv = engine.investigate(env, triage, emit)
    if inv.get("root_cause_category") not in CATEGORY_IDS:
        inv["root_cause_category"] = "unknown"
    changes = env.changes_data()
    culprit = next((c for c in changes if c["id"] == inv.get("culprit_change_id")), None)
    if inv.get("culprit_change_id") and not culprit:
        inv["culprit_change_id"] = None  # model named a change that does not exist

    fix = engine.propose_fix(env, inv, culprit, emit)
    reasons = check_patch(fix.get("patch", ""))
    fix["blocked"] = bool(reasons)
    fix["block_reasons"] = reasons
    if reasons:
        emit("guardrail", "warning", "Patch blocked: " + "; ".join(reasons))

    injection = {"detected": bool(env.injection_lines), "lines": env.injection_lines}
    if env.injection_lines:
        emit("guardrail", "warning", f"Removed {len(env.injection_lines)} suspected prompt-injection line(s) from tool output.")

    return {
        "scenario_id": scenario["id"],
        "engine": engine.name,
        "triage": triage,
        "investigation": inv,
        "culprit": culprit,
        "fix": fix,
        "injection": injection,
        "metrics": {
            "latency_s": round(time.time() - t0, 3),
            "tokens": engine.tokens - tokens0,
            "cost_usd": round(engine.cost - cost0, 6),
        },
    }
