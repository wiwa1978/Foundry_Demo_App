from typing import Any, Literal

from pydantic import Field, field_validator

from app.api.features.shared_schemas import ProviderTrace
from app.api.schemas import MAX_MODEL_NAME_LENGTH, InternalRequestModel

MAX_TRANSLATION_TEXT_LENGTH = 5_000
MAX_LANGUAGE_CODE_LENGTH = 35
AZURE_MT_ENGINE = "azure-mt"
AZURE_LANGUAGE_ENGINE = "azure-language"
LanguageServiceMode = Literal[
    "translator_text",
    "translator_document",
    "language_detection_text",
    "pii_text",
    "pii_document",
    "pii_conversation",
    "health_text",
]


class TextTranslationRequest(InternalRequestModel):
    text: str = Field(min_length=1, max_length=MAX_TRANSLATION_TEXT_LENGTH)
    source_language: str | None = Field(default=None, max_length=MAX_LANGUAGE_CODE_LENGTH)
    target_language: str = Field(
        default="en",
        min_length=2,
        max_length=MAX_LANGUAGE_CODE_LENGTH,
    )
    model: str = Field(default=AZURE_MT_ENGINE, max_length=MAX_MODEL_NAME_LENGTH)
    mode: LanguageServiceMode = "translator_text"

    @field_validator("text", "target_language")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("source_language")
    @classmethod
    def normalize_source_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or value.lower() == "auto":
            return None
        return value

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        value = value.strip()
        return value or AZURE_MT_ENGINE

    @property
    def uses_azure_mt(self) -> bool:
        return self.model.strip().lower() == AZURE_MT_ENGINE


class TextTranslationItem(InternalRequestModel):
    language: str
    text: str


class TextTranslationResponse(InternalRequestModel):
    source_language: str | None = None
    detected_language: str | None = None
    detected_confidence: float | None = None
    target_language: str
    translated_text: str
    translations: list[TextTranslationItem]
    engine: str = AZURE_MT_ENGINE
    mode: LanguageServiceMode = "translator_text"
    analysis: dict[str, Any] = Field(default_factory=dict)
    foundry_requests: list[ProviderTrace] = Field(default_factory=list)
    foundry_responses: list[ProviderTrace] = Field(default_factory=list)
