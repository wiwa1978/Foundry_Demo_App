"""Retail Shopping Assistant backed by the repo2 demo catalog and agents.

The browser owns cart state at the request boundary. Before the later A2A
implementation, a Foundry handoff agent selects the domain agent for each
session turn and the selected agent is invoked through the local processor.
"""

import asyncio
import json
import logging
import os
import re
from typing import Any
from uuid import uuid4

from azure.ai.projects import AIProjectClient

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

from ..agent.agent_registry import resolve_retail_agent_name
from ..agent.catalog import catalog_cosmos_configured, load_catalog, search_products  # noqa: F401
from ..agent.demo_inventory import DEMO_STOCK
from ..agent.handoff_service import HandoffService
from .schemas import RetailCartItem

logger = logging.getLogger(__name__)
_PRODUCT_ID = re.compile(r"\bPROD\d{4}\b", re.IGNORECASE)
_handoff_service = HandoffService()

def _step(label: str, status: str, detail: str | None = None) -> dict[str, Any]:
    event: dict[str, Any] = {"type": "step", "label": label, "status": status}
    if detail:
        event["detail"] = detail
    return event


def _stock(product_id: str) -> int:
    return DEMO_STOCK.get(str(product_id).upper(), 0)


def _cart_item(product: dict[str, Any], quantity: int = 1) -> RetailCartItem:
    price = float(product.get("price") or 0)
    return RetailCartItem(
        product_id=str(product["id"]),
        name=str(product["name"]),
        quantity=quantity,
        price=price,
        total=round(price * quantity, 2),
    )


def _apply_cart(message: str, cart: list[RetailCartItem], products: list[dict[str, Any]]) -> tuple[list[RetailCartItem], str]:
    lowered = message.lower()
    updated = {item.product_id.upper(): item for item in cart}
    if not any(word in lowered for word in ("cart", "checkout", "basket", "buy")):
        return list(updated.values()), ""

    ids = {match.upper() for match in _PRODUCT_ID.findall(message)}
    candidates = [product for product in products if str(product["id"]).upper() in ids]
    if not candidates and any(word in lowered for word in ("add", "buy", "purchase")):
        candidates = products[:1]

    if any(word in lowered for word in ("remove", "delete", "take out")):
        removed = 0
        for product in candidates:
            if updated.pop(str(product["id"]).upper(), None):
                removed += 1
        return list(updated.values()), (
            f"Removed {removed} item{'s' if removed != 1 else ''} from your cart."
            if removed
            else "I couldn't find that item in your cart."
        )

    if any(word in lowered for word in ("add", "buy", "purchase")):
        for product in candidates:
            key = str(product["id"]).upper()
            existing = updated.get(key)
            if existing:
                updated[key] = existing.model_copy(
                    update={
                        "quantity": existing.quantity + 1,
                        "total": round(existing.price * (existing.quantity + 1), 2),
                    }
                )
            else:
                updated[key] = _cart_item(product)
        return list(updated.values()), (
            f"Added {len(candidates)} item{'s' if len(candidates) != 1 else ''} to your cart."
            if candidates
            else "Tell me which product you would like to add."
        )

    if "checkout" in lowered:
        return list(updated.values()), "Your cart is ready for checkout at a Zava retail outlet in Miami, Florida."
    return list(updated.values()), ""

async def classify_intent(
    handoff_service: HandoffService,
    user_message: str,
    session_id: str,
    project_client: Any | None = None,
    formatted_history: str | None = None,
) -> tuple[str, str, dict[str, Any]]:
    """Select a retail domain using the repo2 handoff pattern."""
    intent = await asyncio.to_thread(
        handoff_service.classify_intent,
        user_message,
        session_id,
        formatted_history,
        project_client=project_client,
    )
    agent_type = intent["agent_id"]
    return agent_type, resolve_retail_agent_name(agent_type), intent


async def stream_retail_agent(
    message: str,
    *,
    session_id: str | None = None,
    cart: list[RetailCartItem] | None = None,
):
    settings = load_settings()
    session = session_id or str(uuid4())
    current_cart = list(cart or [])
    entry_agent_name = resolve_retail_agent_name("cora")
    yield {
        "type": "start",
        "message": message,
        "session_id": session,
        "agent_name": entry_agent_name,
        "project_endpoint": settings.endpoint,
        "cart": current_cart,
    }
    try:
        yield _step("Search product catalog", "running")
        await asyncio.sleep(0)
        products = search_products(message)
        catalog_source = "Cosmos DB vector catalog" if catalog_cosmos_configured() else "bundled demo catalog"
        yield _step("Search product catalog", "done", f"{len(products)} products matched ({catalog_source})")
        if products:
            yield {"type": "products", "products": products}

        yield _step("Update request cart", "running")
        updated_cart, cart_note = _apply_cart(message, current_cart, products)
        yield _step("Update request cart", "done")

        configured_agent_name = os.getenv("FOUNDRY_RETAIL_AGENT_NAME")
        offline_mode = os.getenv("FOUNDRY_RETAIL_OFFLINE_MODE", "").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if settings.endpoint and not configured_agent_name and not offline_mode:
            detail = (
                "No retail Foundry agent is configured. Set "
                "FOUNDRY_RETAIL_AGENT_NAME to a deployed agent, or explicitly enable "
                "FOUNDRY_RETAIL_OFFLINE_MODE for the bundled demo."
            )
            yield _step("Classify intent", "error", detail)
            yield {"type": "error", "error": detail}
            return

        project_client = None
        if settings.endpoint and configured_agent_name and not offline_mode:
            project_client = AIProjectClient(
                endpoint=settings.endpoint,
                credential=get_azure_credential(),
                allow_preview=True,
            )

        _handoff_service.handoff_agent_name = resolve_retail_agent_name("handoff")
        yield _step("Classify intent", "running")
        selected_agent_type, selected_agent_name, intent = await classify_intent(
            _handoff_service,
            message,
            session,
            project_client,
        )
        yield _step(
            "Classify intent",
            "done",
            f"Selected {selected_agent_type} ({intent['confidence']:.2f} confidence)",
        )
        yield {
            "type": "agent_selected",
            "agent_type": selected_agent_type,
            "agent_name": selected_agent_name,
            "confidence": intent["confidence"],
            "reasoning": intent["reasoning"],
        }

        if project_client is not None:
            from ..agent.agent_processor import AgentProcessor

            yield _step(f"Invoke {selected_agent_type}", "running")
            agent_context = message
            if selected_agent_type == "cora":
                agent_context = f"{message}\n\nAvailable products:\n{json.dumps(products)}"
            if selected_agent_type == "interior_designer":
                agent_context = json.dumps(
                    [
                        {
                            "Conversation_history": "",
                            "image_url": "",
                            "image_description": "",
                            "products_available": products,
                            "user_last_query": message,
                        }
                    ]
                )
            elif selected_agent_type == "cart_manager":
                agent_context = (
                    f"{message}\n\nCurrent cart:\n"
                    f"{json.dumps([item.model_dump() for item in updated_cart])}"
                )
            processor = AgentProcessor(
                project_client,
                selected_agent_name,
                selected_agent_type,
            )
            chunks: list[str] = []
            async for chunk in processor.run_conversation_with_text_stream(agent_context):
                chunks.append(chunk)
                yield {"type": "delta", "delta": chunk}
            answer = "".join(chunks)
            yield _step(f"Invoke {selected_agent_type}", "done")
            yield {
                "type": "completed",
                "answer": answer,
                "agent": selected_agent_name,
                "cart": updated_cart,
                "products": products,
            }
            return

        if selected_agent_type == "inventory_agent":
            answer = (
                "\n".join(
                    f"{product['name']} ({product['id']}): {_stock(product['id'])} in stock."
                    for product in products[:3]
                )
                or "I couldn't find matching products in the demo catalog."
            )
        elif selected_agent_type == "cart_manager":
            summary = ", ".join(f"{item.name} ×{item.quantity}" for item in updated_cart)
            answer = cart_note or (f"Your cart contains: {summary}." if summary else "Your cart is empty.")
        elif selected_agent_type == "customer_loyalty":
            answer = "Demo loyalty discount: 7.5%."
        else:
            answer = (
                f"I found {len(products)} marketplace option{'s' if len(products) != 1 else ''} "
                "from the Zava demo catalog. "
                "Ask me to add a product to your cart or check its stock."
                if products
                else "I couldn't find a close match. Try a color, product type, or product ID."
            )

        for chunk in (answer[i : i + 160] for i in range(0, len(answer), 160)):
            yield {"type": "delta", "delta": chunk}
        yield {
            "type": "completed",
            "answer": answer,
            "agent": selected_agent_name,
            "cart": updated_cart,
            "products": products,
        }
    except Exception:
        logger.exception("retail_agent_failed session_id=%s", session)
        yield _step("Retail assistant", "error", "The retail request failed.")
        yield {"type": "error", "error": "Retail assistant failed. Check the backend logs for details."}
