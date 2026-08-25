import pytest

from usecases_agents.retail_agent.backend.schemas import RetailAgentRequest
from usecases_agents.retail_agent.backend.service import load_catalog, stream_retail_agent


def test_retail_request_normalizes_message_and_accepts_cart():
    request = RetailAgentRequest(message="  add PROD0001  ")
    assert request.message == "add PROD0001"
    assert request.cart == []


@pytest.mark.anyio
async def test_retail_stream_round_trips_cart_and_emits_products(monkeypatch):
    monkeypatch.setenv("FOUNDRY_RETAIL_OFFLINE_MODE", "true")
    events = [
        event
        async for event in stream_retail_agent("Add PROD0001 to my cart", cart=[])
    ]
    assert len(load_catalog()) > 1
    assert [event["type"] for event in events[:2]] == ["start", "step"]
    assert any(event["type"] == "products" for event in events)
    completed = events[-1]
    assert completed["type"] == "completed"
    assert completed["cart"][0].product_id == "PROD0001"

def test_handoff_service_uses_structured_foundry_result():
    import json
    from types import SimpleNamespace

    from usecases_agents.retail_agent.agent.handoff_service import HandoffService

    class FakeResponses:
        def create(self, **_kwargs):
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "domain": "inventory_agent",
                        "is_domain_change": True,
                        "confidence": 0.97,
                        "reasoning": "The customer asks about stock.",
                    }
                )
            )

    class FakeClient:
        conversations = SimpleNamespace(
            create=lambda **_kwargs: SimpleNamespace(id="handoff-conversation")
        )
        responses = FakeResponses()

    class FakeProject:
        def get_openai_client(self):
            return FakeClient()

    handoff = HandoffService(handoff_agent_name="zava-handoff-service-agent")
    first = handoff.classify_intent("Hello", "session-1", project_client=FakeProject())
    second = handoff.classify_intent(
        "How much stock do you have?",
        "session-1",
        project_client=FakeProject(),
    )

    assert first["domain"] == "cora"
    assert second["domain"] == "inventory_agent"
    assert handoff.get_current_domain("session-1") == "inventory_agent"


def test_retail_agent_defaults_use_zava_names(monkeypatch):
    monkeypatch.delenv("FOUNDRY_RETAIL_AGENT_NAME", raising=False)

    from usecases_agents.retail_agent.agent.agent_registry import resolve_retail_agent_name

    assert resolve_retail_agent_name("cora") == "zava-shop-assistant-agent"
    assert resolve_retail_agent_name("inventory_agent") == "zava-inventory-agent"
    assert resolve_retail_agent_name("handoff") == "zava-handoff-service-agent"

@pytest.mark.anyio
async def test_retail_stream_invokes_selected_agent(monkeypatch):
    import json
    from types import SimpleNamespace

    from usecases_agents.retail_agent.backend import service as retail_service

    class FakeResponses:
        def create(self, **_kwargs):
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "domain": "inventory_agent",
                        "is_domain_change": True,
                        "confidence": 0.95,
                        "reasoning": "The customer asks about stock.",
                    }
                )
            )

    class FakeOpenAIClient:
        conversations = SimpleNamespace(
            create=lambda **_kwargs: SimpleNamespace(id="handoff-conversation")
        )
        responses = FakeResponses()

    class FakeProjectClient:
        def __init__(self, **_kwargs):
            pass

        def get_openai_client(self):
            return FakeOpenAIClient()

    calls = []

    class FakeAgentProcessor:
        def __init__(self, _project_client, agent_name, agent_type):
            calls.append((agent_name, agent_type))

        async def run_conversation_with_text_stream(self, _message):
            yield "inventory answer"

    monkeypatch.setenv("FOUNDRY_PROJECT_ENDPOINT", "https://foundry.example/api/projects/zava")
    monkeypatch.setenv("FOUNDRY_RETAIL_AGENT_NAME", "zava-shop-assistant-agent")
    monkeypatch.delenv("FOUNDRY_RETAIL_OFFLINE_MODE", raising=False)
    monkeypatch.setattr(retail_service, "AIProjectClient", FakeProjectClient)
    from usecases_agents.retail_agent.agent import agent_processor

    monkeypatch.setattr(agent_processor, "AgentProcessor", FakeAgentProcessor)
    session_id = "routing-test-session"
    retail_service._handoff_service._session_domains[session_id] = "cora"

    events = [
        event
        async for event in retail_service.stream_retail_agent(
            "How much PROD0001 is in stock?", session_id=session_id
        )
    ]

    selected = next(event for event in events if event["type"] == "agent_selected")
    assert selected["agent_type"] == "inventory_agent"
    assert selected["agent_name"] == "zava-inventory-agent"
    assert calls == [("zava-inventory-agent", "inventory_agent")]
    assert events[-1]["type"] == "completed"
