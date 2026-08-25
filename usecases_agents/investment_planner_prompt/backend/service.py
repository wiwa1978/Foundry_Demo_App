"""Invoke the published Investment Planner prompt agent.

The agent itself is *configuration* published to Foundry (model + instructions + tools) by
``agent/provision_agent.py``. This service only invokes it and relays the Responses API
stream to the browser, surfacing each skill invocation as a step so the demo shows the
agent reaching Blob Storage under its own identity.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from azure.ai.projects import AIProjectClient
from openai import PermissionDeniedError

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

logger = logging.getLogger(__name__)

# The managed harness can close the SSE stream while the run continues in the background.
POLL_ATTEMPTS = 60
POLL_DELAY_SECONDS = 3.0
TERMINAL_STATUSES = {"completed", "failed", "incomplete", "cancelled"}


def _step(label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    event: dict[str, Any] = {"type": "step", "label": label, "status": status}
    if detail:
        event["detail"] = detail
    return event


def _item_type(item: Any) -> str | None:
    value = getattr(item, "type", None)
    return value if isinstance(value, str) else None


def _tool_label(item: Any) -> str:
    name = getattr(item, "name", None)
    return f"Skill: {name}" if isinstance(name, str) and name else "Skill call"


async def stream_investment_plan(question: str) -> AsyncIterator[dict[str, Any]]:
    settings = load_settings()
    if not settings.is_investment_planner_configured:
        raise RuntimeError(
            "Investment Planner is not configured. Set FOUNDRY_PROJECT_ENDPOINT and publish "
            "the prompt agent with usecases_agents/investment_planner_prompt/agent."
        )
    if not settings.endpoint or not settings.investment_planner_agent_name:
        raise RuntimeError("Investment Planner configuration is incomplete.")

    agent_name = settings.investment_planner_agent_name
    yield {
        "type": "start",
        "question": question,
        "agent_name": agent_name,
        "project_endpoint": settings.endpoint,
    }

    try:
        yield _step("Connect to Foundry", "running")
        project_client = AIProjectClient(
            endpoint=settings.endpoint,
            credential=get_azure_credential(),
            allow_preview=True,
        )
        openai_client = project_client.get_openai_client()
        conversation = openai_client.conversations.create()
        yield _step("Connect to Foundry", "done")

        yield _step(f"Invoke {agent_name}", "running")
        response = openai_client.responses.create(
            conversation=conversation.id,
            input=question,
            stream=True,
            extra_body={"agent_reference": {"name": agent_name, "type": "agent_reference"}},
        )

        chunks: list[str] = []
        response_id: str | None = None
        terminal = False
        for event in response:
            if event.type == "response.created":
                candidate = getattr(event.response, "id", None)
                if isinstance(candidate, str):
                    response_id = candidate
            elif event.type == "response.output_text.delta":
                chunks.append(event.delta)
                yield {"type": "delta", "delta": event.delta}
            elif event.type == "response.output_item.added":
                item = getattr(event, "item", None)
                if _item_type(item) == "function_call":
                    yield _step(_tool_label(item), "running")
            elif event.type == "response.output_item.done":
                item = getattr(event, "item", None)
                if _item_type(item) == "function_call":
                    yield _step(_tool_label(item), "done")
            elif event.type == "response.completed":
                terminal = True
                candidate = getattr(event.response, "id", None)
                if isinstance(candidate, str):
                    response_id = candidate
            elif event.type in ("response.failed", "response.incomplete"):
                terminal = True
                yield _step(f"Invoke {agent_name}", "error", "The agent run did not complete.")
                yield {
                    "type": "error",
                    "error": f"{agent_name} did not complete. Check the Foundry run for details.",
                }
                return

        answer = "".join(chunks)

        if not terminal and response_id:
            yield _step("Await background run", "running")
            polled = await _poll_until_terminal(openai_client, response_id)
            if polled is None:
                yield _step("Await background run", "error", "Timed out waiting for the run.")
                yield {
                    "type": "error",
                    "error": f"{agent_name} did not finish before the timeout.",
                }
                return
            status = getattr(polled, "status", None)
            if status != "completed":
                yield _step("Await background run", "error", f"Run status: {status}.")
                yield {"type": "error", "error": f"{agent_name} finished with status '{status}'."}
                return
            answer = getattr(polled, "output_text", "") or answer
            yield _step("Await background run", "done")
            if answer:
                yield {"type": "delta", "delta": answer}

        yield _step(f"Invoke {agent_name}", "done")
        yield {"type": "completed", "answer": answer, "response_id": response_id}
    except PermissionDeniedError:
        logger.exception("investment_planner_forbidden agent_name=%s", agent_name)
        yield _step(
            f"Invoke {agent_name}",
            "error",
            "The backend identity does not have permission to invoke Foundry agents.",
        )
        yield {
            "type": "error",
            "error": (
                f"The backend identity cannot invoke {agent_name}. Assign it the Foundry User "
                "role on the Foundry resource or project."
            ),
        }
    except Exception:
        logger.exception("investment_planner_failed agent_name=%s", agent_name)
        yield _step(f"Invoke {agent_name}", "error", "The Foundry agent request failed.")
        yield {
            "type": "error",
            "error": f"{agent_name} failed. Check the backend logs for details.",
        }


async def _poll_until_terminal(openai_client: Any, response_id: str) -> Any | None:
    for _ in range(POLL_ATTEMPTS):
        polled = openai_client.responses.retrieve(response_id)
        if getattr(polled, "status", None) in TERMINAL_STATUSES:
            return polled
        await asyncio.sleep(POLL_DELAY_SECONDS)
    return None
