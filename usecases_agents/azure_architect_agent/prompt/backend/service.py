import logging
from collections.abc import AsyncIterator
from typing import Any

from azure.ai.projects import AIProjectClient
from openai import PermissionDeniedError

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings
from usecases_agents.azure_architect_agent.prompt.backend.schemas import (
    AzureArchitectAgentCitation,
)

logger = logging.getLogger(__name__)


def _normalize_url(url: Any) -> str | None:
    if isinstance(url, str):
        cleaned = url.strip()
        return cleaned or None
    return None


def _extract_citations(result: Any) -> list[AzureArchitectAgentCitation]:
    citations: list[AzureArchitectAgentCitation] = []
    seen_urls: set[str] = set()

    for message in getattr(result, "output", []) or []:
        for content in getattr(message, "content", []) or []:
            annotations = getattr(content, "annotations", None) or []
            for annotation in annotations:
                url = _normalize_url(getattr(annotation, "url", None))
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                title = getattr(annotation, "title", None)
                if isinstance(title, str):
                    title = title.strip() or None
                citations.append(AzureArchitectAgentCitation(title=title, url=url))
    return citations


def _step(label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": "step", "label": label, "status": status}
    if detail:
        payload["detail"] = detail
    return payload


async def stream_azure_architect_agent(question: str) -> AsyncIterator[dict[str, Any]]:
    settings = load_settings()
    if not settings.is_azure_architect_agent_configured:
        raise RuntimeError(
            "Azure Architect Agent is not configured. Set FOUNDRY_PROJECT_ENDPOINT "
            "and ensure azure-architect-prompt is published in Foundry."
        )
    if not settings.endpoint:
        raise RuntimeError("Azure Architect Agent configuration is incomplete.")

    credential = get_azure_credential()
    agent_name = "azure-architect-prompt"

    yield {
        "type": "start",
        "question": question,
        "agent_name": agent_name,
        "project_endpoint": settings.endpoint,
        "tracing_enabled": bool(
            getattr(settings, "application_insights_resource_id", None)
        ),
    }

    try:
        yield _step("Connect to Foundry", "running")
        project_client = AIProjectClient(
            endpoint=settings.endpoint,
            credential=credential,
            allow_preview=True,
        )
        openai_client = project_client.get_openai_client()
        yield _step("Connect to Foundry", "done")

        yield _step("Invoke azure-architect-prompt", "running")
        response = openai_client.responses.create(
            input=question,
            extra_body={
                "agent_reference": {
                    "name": agent_name,
                    "type": "agent_reference",
                }
            },
            stream=True,
        )
        yield _step("Stream answer", "running")

        chunks: list[str] = []
        citations: list[AzureArchitectAgentCitation] = []
        response_id: str | None = None
        for event in response:
            if event.type == "response.output_text.delta":
                chunks.append(event.delta)
                yield {"type": "delta", "delta": event.delta}
            elif event.type == "response.completed":
                citations = _extract_citations(event.response)
                candidate_response_id = getattr(event.response, "id", None)
                if isinstance(candidate_response_id, str):
                    response_id = candidate_response_id

        answer = "".join(chunks)
        yield _step("Invoke azure-architect-prompt", "done")
        yield _step("Stream answer", "done")
        yield {
            "type": "completed",
            "answer": answer,
            "citations": [citation.model_dump() for citation in citations],
            "response_id": response_id,
            "tracing_enabled": bool(
                getattr(settings, "application_insights_resource_id", None)
            ),
        }
    except PermissionDeniedError:
        logger.exception("azure_architect_agent_forbidden agent_name=%s", agent_name)
        yield _step(
            "Invoke azure-architect-prompt",
            "error",
            "The backend identity does not have permission to invoke Foundry agents.",
        )
        yield {
            "type": "error",
            "error": (
                "The backend identity cannot invoke azure-architect-prompt. Assign it the Foundry User "
                "role on the Foundry resource or project."
            ),
        }
    except Exception:
        logger.exception("azure_architect_agent_failed agent_name=%s", agent_name)
        yield _step("Invoke azure-architect-prompt", "error", "The Foundry agent request failed.")
        yield {
            "type": "error",
            "error": "azure-architect-prompt failed. Check the backend logs for details.",
        }
