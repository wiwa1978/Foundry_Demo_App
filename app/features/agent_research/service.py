import logging
from collections.abc import AsyncIterator
from typing import Any

from azure.ai.projects import AIProjectClient
from openai import PermissionDeniedError

from app.azure_credential import get_azure_credential
from app.features.agent_research.schemas import AgentResearchCitation
from app.providers.settings import load_settings

logger = logging.getLogger(__name__)

def _normalize_url(url: Any) -> str | None:
    if isinstance(url, str):
        cleaned = url.strip()
        return cleaned or None
    return None


def _extract_citations(result: Any) -> list[AgentResearchCitation]:
    citations: list[AgentResearchCitation] = []
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
                citations.append(
                    AgentResearchCitation(
                        title=title,
                        url=url,
                    )
                )
    return citations


def _step(label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "step",
        "label": label,
        "status": status,
    }
    if detail:
        payload["detail"] = detail
    return payload


async def stream_agent_research(question: str) -> AsyncIterator[dict[str, Any]]:
    settings = load_settings()
    if not settings.is_agent_research_configured:
        raise RuntimeError(
            "Research Agent is not configured. Set FOUNDRY_PROJECT_ENDPOINT "
            "and ensure ResearchAgent is published in Foundry."
        )
    if not settings.endpoint:
        raise RuntimeError("Research Agent configuration is incomplete.")

    credential = get_azure_credential()
    agent_name = "ResearchAgent"

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

        yield _step("Invoke ResearchAgent", "running")
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
        citations: list[AgentResearchCitation] = []
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
        yield _step("Invoke ResearchAgent", "done")
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
        logger.exception("agent_research_forbidden agent_name=%s", agent_name)
        yield _step(
            "Invoke ResearchAgent",
            "error",
            "The backend identity does not have permission to invoke Foundry agents.",
        )
        yield {
            "type": "error",
            "error": (
                "The backend identity cannot invoke ResearchAgent. Assign it the Foundry User "
                "role on the Foundry resource or project."
            ),
        }
    except Exception:
        logger.exception("agent_research_failed agent_name=%s", agent_name)
        yield _step("Invoke ResearchAgent", "error", "The Foundry agent request failed.")
        yield {
            "type": "error",
            "error": "ResearchAgent failed. Check the backend logs for details.",
        }
