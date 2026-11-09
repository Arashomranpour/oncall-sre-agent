"""Safety layer: prompt-injection scanning of untrusted data and checks on proposed patches.

Honest scope: the injection scan is pattern-based, so a determined attacker can phrase around it.
That is why the design also has a second, structural defence: agents have no write tools, a
patch is only ever a proposal, and a human must approve it.
"""
from __future__ import annotations

import re

INJECTION_PATTERNS = [
    r"ignore (all )?(the )?(previous|prior|above|earlier) (instructions|prompts?|rules)",
    r"disregard (all )?(the )?(previous|prior|above) (instructions|prompts?|rules)",
    r"you are now (in )?(admin|developer|root|god) mode",
    r"(reveal|print|show) (your )?system prompt",
    r"run `?(terraform destroy|rm -rf)",
    r"report the root cause as",
]
_INJ = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)

DANGEROUS_PATCH_PATTERNS = [
    r"terraform\s+destroy",
    r"\brm\s+-rf\b",
    r"drop\s+(table|database)\b",
    r"aws\s+\S+\s+delete-",
    r"--force\b",
    r"auto-approve",
    r"curl[^|\n]*\|\s*(ba)?sh",
    r"chmod\s+777",
    r'"\*"\s*[:,\]]',  # wildcard IAM actions/resources
]
_DANGER = re.compile("|".join(DANGEROUS_PATCH_PATTERNS), re.IGNORECASE)

REMOVED = "[REMOVED: suspected prompt injection]"


def scan_untrusted(text: str) -> tuple[str, list[str]]:
    """Return (sanitized_text, flagged_lines). Flagged lines are replaced, not passed on."""
    clean, flagged = [], []
    for line in text.splitlines():
        if _INJ.search(line):
            flagged.append(line.strip())
            clean.append(REMOVED)
        else:
            clean.append(line)
    return "\n".join(clean), flagged


def wrap_untrusted(text: str, source: str) -> str:
    """Mark tool output as data so the model is told not to obey anything inside it."""
    return f'<untrusted_data source="{source}">\n{text}\n</untrusted_data>'


def check_patch(patch: str) -> list[str]:
    """Return reasons a proposed patch is unsafe (empty list = acceptable). Only added lines count."""
    reasons = []
    for line in patch.splitlines():
        if line.startswith("+") and not line.startswith("+++") and _DANGER.search(line):
            reasons.append(f"dangerous content in added line: {line[:80]}")
    return reasons
