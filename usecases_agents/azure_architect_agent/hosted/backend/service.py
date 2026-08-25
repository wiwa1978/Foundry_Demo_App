import logging
from collections.abc import AsyncIterator
from typing import Any

from azure.ai.projects import AIProjectClient
from openai import PermissionDeniedError

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

logger = logging.getLogger(__name__)


def _step(label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    event: dict[str, Any] = {"type": "step", "label": label, "status": status}
    if detail:
        event["detail"] = detail
    return event


async def stream_hosted_agent(
    message: str, agent_key: str | None = None
) -> AsyncIterator[dict[str, Any]]:
    settings = load_settings()
    if not settings.is_hosted_agent_configured:
        raise RuntimeError(
            "Hosted Agent is not configured. Set FOUNDRY_PROJECT_ENDPOINT and "
            "FOUNDRY_HOSTED_AGENT_NAME (or FOUNDRY_HOSTED_AGENT_VARIANTS) after deploying "
            "the agent."
        )
    variants = settings.hosted_agent_variants
    if not variants:
        raise RuntimeError("Hosted Agent configuration is incomplete.")

    variant = next((item for item in variants if item.key == agent_key), variants[0])
    agent_name = variant.agent_name
    yield {
        "type": "start",
        "message": message,
        "agent_name": agent_name,
        "agent_key": variant.key,
        "project_endpoint": settings.endpoint,
    }

    try:
        yield _step("Connect to hosted endpoint", "running")
        project_client = AIProjectClient(
            endpoint=settings.endpoint,
            credential=get_azure_credential(),
            allow_preview=True,
        )
        openai_client = project_client.get_openai_client(agent_name=agent_name)
        yield _step("Connect to hosted endpoint", "done")

        yield _step(f"Invoke {agent_name}", "running")
        response = openai_client.responses.create(input=message, stream=True)
        chunks: list[str] = []
        for event in response:
            if event.type == "response.output_text.delta":
                chunks.append(event.delta)
                yield {"type": "delta", "delta": event.delta}

        answer = "".join(chunks)
        yield _step(f"Invoke {agent_name}", "done")
        yield {"type": "completed", "answer": answer}
    except PermissionDeniedError:
        logger.exception("hosted_agent_forbidden agent_name=%s", agent_name)
        yield _step(
            f"Invoke {agent_name}",
            "error",
            "The backend identity does not have permission to invoke hosted agents.",
        )
        yield {
            "type": "error",
            "error": (
                f"The backend identity cannot invoke {agent_name}. Assign it the "
                "Foundry User role on the Foundry resource or project."
            ),
        }
    except Exception:
        logger.exception("hosted_agent_failed agent_name=%s", agent_name)
        yield _step(f"Invoke {agent_name}", "error", "The hosted agent request failed.")
        yield {
            "type": "error",
            "error": f"{agent_name} failed. Check the backend logs for details.",
        }
