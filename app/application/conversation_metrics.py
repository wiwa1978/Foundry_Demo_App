from datetime import UTC, datetime, timedelta
from typing import Any, TypedDict

from app.application.ports.conversations import ConversationRepository
from app.domain.identity import UserScope


class MetricsDay(TypedDict):
    date: str
    label: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    total_duration_ms: int
    duration_count: int
    avg_duration_ms: int


class MetricsSummary(TypedDict):
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    avg_prompt_tokens: int
    avg_completion_tokens: int
    avg_total_tokens: int
    avg_duration_ms: int


class UsageMetrics(TypedDict):
    days: list[MetricsDay]
    models: list[str]
    summary: MetricsSummary


def calculate_usage_metrics(
    repository: ConversationRepository,
    *,
    scope: UserScope,
    days: int,
    model: str | None = None,
    input_token_cost_per_1k: float = 0,
    output_token_cost_per_1k: float = 0,
) -> UsageMetrics:
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=days - 1)
    buckets: dict[str, MetricsDay] = {
        item.isoformat(): {
            "date": item.isoformat(),
            "label": item.strftime("%d/%m"),
            "requests": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost": 0.0,
            "total_duration_ms": 0,
            "duration_count": 0,
            "avg_duration_ms": 0,
        }
        for item in (start_date + timedelta(days=offset) for offset in range(days))
    }
    rows = repository.list_usage(
        scope,
        f"{start_date.isoformat()}T00:00:00+00:00",
        model,
    )
    models: set[str] = set()
    request_count = prompt_tokens = completion_tokens = total_tokens = 0
    duration_total = duration_count = 0
    for row in rows:
        bucket = buckets.get(row.created_at[:10])
        if bucket is None:
            continue
        if row.model:
            models.add(row.model)
        usage = row.usage or {}
        row_prompt_tokens = _usage_value(usage, "prompt_tokens")
        row_completion_tokens = _usage_value(usage, "completion_tokens")
        row_total_tokens = _usage_value(usage, "total_tokens") or (
            row_prompt_tokens + row_completion_tokens
        )
        row_cost = (row_prompt_tokens / 1000) * input_token_cost_per_1k + (
            row_completion_tokens / 1000
        ) * output_token_cost_per_1k
        request_count += 1
        prompt_tokens += row_prompt_tokens
        completion_tokens += row_completion_tokens
        total_tokens += row_total_tokens
        bucket["requests"] += 1
        bucket["prompt_tokens"] += row_prompt_tokens
        bucket["completion_tokens"] += row_completion_tokens
        bucket["total_tokens"] += row_total_tokens
        bucket["estimated_cost"] += row_cost
        if row.duration_ms is not None:
            duration_total += row.duration_ms
            duration_count += 1
            bucket["total_duration_ms"] += row.duration_ms
            bucket["duration_count"] += 1

    for bucket in buckets.values():
        if bucket["duration_count"]:
            bucket["avg_duration_ms"] = round(
                bucket["total_duration_ms"] / bucket["duration_count"]
            )
        bucket["estimated_cost"] = round(bucket["estimated_cost"], 6)
    estimated_cost = (prompt_tokens / 1000) * input_token_cost_per_1k + (
        completion_tokens / 1000
    ) * output_token_cost_per_1k
    return {
        "days": list(buckets.values()),
        "models": sorted(models),
        "summary": {
            "requests": request_count,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "estimated_cost": round(estimated_cost, 6),
            "avg_prompt_tokens": round(prompt_tokens / request_count) if request_count else 0,
            "avg_completion_tokens": (
                round(completion_tokens / request_count) if request_count else 0
            ),
            "avg_total_tokens": round(total_tokens / request_count) if request_count else 0,
            "avg_duration_ms": round(duration_total / duration_count) if duration_count else 0,
        },
    }


def _usage_value(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    return int(value) if isinstance(value, int | float) else 0
