from pydantic import BaseModel

from app.api.features.conversations.schemas import ConversationResponse, MessageResponse
from usecases_media.text_chat.backend.schemas import (
    GuardrailComparisonResultResponse,
    ModelResultResponse,
)


class ComparisonResponse(BaseModel):
    conversation: ConversationResponse
    user_message: MessageResponse
    results: list[ModelResultResponse | GuardrailComparisonResultResponse]
