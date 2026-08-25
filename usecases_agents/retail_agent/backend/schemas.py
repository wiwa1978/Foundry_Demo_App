from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class RetailCartItem(BaseModel):
    product_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=99)
    price: float = Field(default=0, ge=0)
    total: float | None = Field(default=None, ge=0)


class RetailAgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = Field(default=None, max_length=200)
    cart: list[RetailCartItem] = Field(default_factory=list, max_length=100)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        message = value.strip()
        if not message:
            raise ValueError("Message cannot be blank.")
        return message


class RetailStartEvent(BaseModel):
    type: Literal["start"] = "start"
    message: str
    session_id: str
    agent_name: str
    project_endpoint: str | None
    cart: list[RetailCartItem]


class RetailStepEvent(BaseModel):
    type: Literal["step"] = "step"
    label: str
    status: Literal["running", "done", "error"]
    detail: str | None = None


class RetailProductsEvent(BaseModel):
    type: Literal["products"] = "products"
    products: list[dict[str, Any]]
class RetailAgentSelectedEvent(BaseModel):
    type: Literal["agent_selected"] = "agent_selected"
    agent_type: str
    agent_name: str
    confidence: float
    reasoning: str


class RetailDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    delta: str


class RetailCompletedEvent(BaseModel):
    type: Literal["completed"] = "completed"
    answer: str
    agent: str
    cart: list[RetailCartItem]
    products: list[dict[str, Any]]


class RetailErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error: str
