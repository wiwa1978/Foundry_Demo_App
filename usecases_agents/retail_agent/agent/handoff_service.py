"""Intent classification for the pre-A2A retail handoff agent."""

import json
import logging
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

RetailDomain = Literal[
    "cora",
    "interior_designer",
    "inventory_agent",
    "customer_loyalty",
    "cart_manager",
]


class IntentClassification(BaseModel):
    """Validated structured response returned by the handoff agent."""

    model_config = ConfigDict(extra="forbid")

    domain: RetailDomain
    is_domain_change: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""


Intent = IntentClassification

AGENT_DOMAINS = {
    "cora": {
        "name": "Cora Shopping Assistant",
        "description": "General shopping assistance and product browsing",
    },
    "interior_designer": {
        "name": "Interior Design Specialist",
        "description": "Room design, color schemes, and furniture recommendations",
    },
    "inventory_agent": {
        "name": "Inventory Specialist",
        "description": "Product availability and stock levels",
    },
    "customer_loyalty": {
        "name": "Customer Loyalty Specialist",
        "description": "Discounts, promotions, and loyalty programs",
    },
    "cart_manager": {
        "name": "Cart Manager Specialist",
        "description": "Cart operations and checkout assistance",
    },
}


class HandoffService:
    """Routes each session to a retail domain before the later A2A phase."""

    def __init__(
        self,
        *,
        handoff_agent_name: str = "zava-handoff-service-agent",
        default_domain: RetailDomain = "cora",
    ) -> None:
        self.handoff_agent_name = handoff_agent_name
        self.default_domain = default_domain
        self._session_domains: dict[str, RetailDomain] = {}

    def classify_intent(
        self,
        user_message: str,
        session_id: str,
        chat_history: str | None = None,
        *,
        project_client: Any | None = None,
    ) -> dict[str, Any]:
        """Classify a turn using the deployed handoff agent when available.

        The first turn follows repo2's behavior and starts in ``cora``. Later
        turns use the deployed structured-output handoff agent. If that call
        fails, lexical routing keeps the demo usable and preserves the current
        domain.
        """
        current_domain = self._session_domains.get(session_id)
        if current_domain is None:
            self._session_domains[session_id] = self.default_domain
            return self._result(
                self.default_domain,
                is_domain_change=True,
                confidence=1.0,
                reasoning=f"First message, routing to {self.default_domain}",
            )

        prompt = f"Current domain: {current_domain}\nUser message: {user_message}"
        if chat_history:
            prompt = f"{chat_history}\n\n{prompt}"

        try:
            if project_client is None:
                raise RuntimeError("No handoff Foundry client is configured")
            client = project_client.get_openai_client()
            conversation = client.conversations.create(
                items=[{"type": "message", "role": "user", "content": prompt}]
            )
            response = client.responses.create(
                conversation=conversation.id,
                extra_body={
                    "agent_reference": {
                        "name": self.handoff_agent_name,
                        "type": "agent_reference",
                    }
                },
                input="",
            )
            intent = IntentClassification.model_validate(json.loads(response.output_text))
            if intent.is_domain_change:
                self._session_domains[session_id] = intent.domain
            else:
                intent = intent.model_copy(update={"domain": current_domain})
            return self._result(
                intent.domain,
                is_domain_change=intent.is_domain_change,
                confidence=intent.confidence,
                reasoning=intent.reasoning,
            )
        except Exception:
            logger.exception("retail_intent_classification_failed session_id=%s", session_id)
            domain = self._lexical_domain(user_message, current_domain)
            if domain != current_domain:
                self._session_domains[session_id] = domain
            return self._result(
                domain,
                is_domain_change=domain != current_domain,
                confidence=0.3,
                reasoning=f"Classification failed, using {domain}",
            )

    @staticmethod
    def _lexical_domain(user_message: str, current_domain: RetailDomain) -> RetailDomain:
        message = user_message.lower()
        if any(token in message for token in ("cart", "basket", "checkout", "add to")):
            return "cart_manager"
        if any(token in message for token in ("stock", "inventory", "available")):
            return "inventory_agent"
        if any(token in message for token in ("discount", "loyalty", "promotion")):
            return "customer_loyalty"
        if any(token in message for token in ("room", "decorate", "paint color")):
            return "interior_designer"
        return current_domain

    @staticmethod
    def _result(
        domain: RetailDomain,
        *,
        is_domain_change: bool,
        confidence: float,
        reasoning: str,
    ) -> dict[str, Any]:
        return {
            "domain": domain,
            "is_domain_change": is_domain_change,
            "confidence": confidence,
            "reasoning": reasoning,
            "agent_id": domain,
            "agent_name": AGENT_DOMAINS[domain]["name"],
        }

    def get_current_domain(self, session_id: str) -> RetailDomain | None:
        return self._session_domains.get(session_id)

    def reset_session(self, session_id: str) -> None:
        self._session_domains.pop(session_id, None)
