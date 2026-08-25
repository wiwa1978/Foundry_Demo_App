"""Batch evaluation of statements against two guardrail policies.

The interactive comparison stores every turn in a conversation. Batch evaluation is
stateless on purpose: each statement is sent to Foundry on its own, with no history,
so the only difference between the two runs is the guardrail policy.
"""

import logging
from collections.abc import Iterable
from typing import Any, Literal

from app.application.chat_errors import CONTENT_FILTER_MESSAGE, guardrail_error_details
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, ModelSettings

logger = logging.getLogger(__name__)

BatchOutcome = Literal["blocked", "flagged", "allowed", "error"]

MAX_STATEMENTS = 200
MAX_STATEMENT_LENGTH = 4_000
RESPONSE_PREVIEW_LENGTH = 400

_TRIGGER_KEYS = ("filtered", "blocked", "detected")
_FILTER_LABELS = {
    "hate": "Hate",
    "indirect_attack": "Indirect Attack",
    "jailbreak": "Jailbreak",
    "protected_material_code": "Protected Material Code",
    "protected_material_text": "Protected Material Text",
    "self_harm": "Self-harm",
    "selfharm": "Self-harm",
    "sexual": "Sexual",
    "task_adherence": "Task Adherence",
    "violence": "Violence",
}


def normalize_statements(statements: Iterable[str]) -> list[str]:
    """Trim, drop blanks, and collapse duplicates while preserving order."""
    normalized: list[str] = []
    seen: set[str] = set()
    for statement in statements:
        trimmed = " ".join(statement.split())
        if not trimmed:
            continue
        key = trimmed.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(trimmed[:MAX_STATEMENT_LENGTH])
    return normalized


def format_filter_label(name: str) -> str:
    if name.startswith("PII_"):
        remainder = name[4:]
        spaced = ""
        for index, character in enumerate(remainder):
            previous = remainder[index - 1] if index else ""
            if character.isupper() and previous and not previous.isupper():
                spaced += " "
            spaced += character
        return spaced.strip() or name
    return _FILTER_LABELS.get(name.lower(), name.replace("_", " ").replace("-", " ").title())


def extract_triggered_filters(payload: Any) -> list[str]:
    """Collect the guardrail filters Foundry reported as triggered.

    Foundry nests results differently across the Responses and Chat Completions
    surfaces, and again inside content-filter error bodies, so the payload is walked
    recursively and every ``content_filter_results`` map contributes its keys.
    """
    names: set[str] = set()

    def visit(value: Any, context: str | None) -> None:
        if isinstance(value, list | tuple):
            for item in value:
                visit(item, context)
            return
        if not isinstance(value, dict):
            return
        if context and any(value.get(key) is True for key in _TRIGGER_KEYS):
            names.add(format_filter_label(context))
        for key, child in value.items():
            if key in _TRIGGER_KEYS:
                continue
            if key in {"content_filter_results", "content_filter_result"} and isinstance(
                child, dict
            ):
                for filter_name, filter_result in child.items():
                    visit(filter_result, filter_name)
            else:
                visit(child, context)

    visit(payload, None)
    return sorted(names)


def is_content_filter_error(exc: Exception) -> bool:
    body = guardrail_error_details(exc)
    if body is None:
        return False
    error = body.get("error")
    details = error if isinstance(error, dict) else body
    code = details.get("code")
    return isinstance(code, str) and code.lower() == "content_filter"


def _error_message(exc: Exception) -> str:
    body = guardrail_error_details(exc)
    if body is not None:
        error = body.get("error")
        details = error if isinstance(error, dict) else body
        message = details.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    return str(exc) or exc.__class__.__name__


def evaluate_statement(
    gateway: Any,
    *,
    model_settings: ModelSettings,
    statement: str,
    policy_name: str | None,
) -> dict[str, Any]:
    """Run one statement against one policy and classify the guardrail outcome."""
    try:
        response = gateway.complete(
            model=model_settings.model,
            prompt=statement,
            api_surface=model_settings.api_surface,
            system_prompt=model_settings.system_prompt,
            temperature=model_settings.temperature,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            history=[],
            guardrail_policy_name=policy_name,
        )
    except Exception as exc:
        blocked = is_content_filter_error(exc)
        if not blocked:
            logger.exception("guardrail_batch_statement_failed")
        details = guardrail_error_details(exc)
        return {
            "outcome": "blocked" if blocked else "error",
            "blocked": blocked,
            "triggered_filters": extract_triggered_filters(details),
            "response": "",
            "response_preview": "",
            "message": CONTENT_FILTER_MESSAGE if blocked else _error_message(exc),
            "duration_ms": None,
            "guardrail_results": details,
        }

    triggered = extract_triggered_filters(response.get("guardrail_results"))
    content = response.get("content") or ""
    preview = content.strip()[:RESPONSE_PREVIEW_LENGTH]
    return {
        "outcome": "flagged" if triggered else "allowed",
        "blocked": False,
        "triggered_filters": triggered,
        "response": content,
        "response_preview": preview,
        "message": "",
        "duration_ms": response.get("duration_ms"),
        "guardrail_results": response.get("guardrail_results"),
    }


def batch_policy_names(model_settings: ModelSettings) -> list[str | None]:
    """Resolve the two configured policies into request-level policy names."""
    return [
        None if name == DEPLOYMENT_DEFAULT_GUARDRAIL else name
        for name in model_settings.guardrail_policy_names
    ]
