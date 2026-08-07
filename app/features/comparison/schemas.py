from pydantic import BaseModel

from app.features.conversations.schemas import ConversationResponse, MessageResponse
from app.features.text_chat.schemas import (
    GuardrailComparisonResultResponse,
    ModelResultResponse,
)


class ComparisonResponse(BaseModel):
    conversation: ConversationResponse
    user_message: MessageResponse
    results: list[ModelResultResponse | GuardrailComparisonResultResponse]
