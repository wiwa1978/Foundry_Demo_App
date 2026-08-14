from pydantic import Field, field_validator

from app.api.schemas import InternalRequestModel

MAX_TRANSLATION_TEXT_LENGTH = 5_000
MAX_LANGUAGE_CODE_LENGTH = 35


class TextTranslationRequest(InternalRequestModel):
    text: str = Field(min_length=1, max_length=MAX_TRANSLATION_TEXT_LENGTH)
    source_language: str | None = Field(default=None, max_length=MAX_LANGUAGE_CODE_LENGTH)
    target_language: str = Field(min_length=2, max_length=MAX_LANGUAGE_CODE_LENGTH)

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


class TextTranslationItem(InternalRequestModel):
    language: str
    text: str


class TextTranslationResponse(InternalRequestModel):
    source_language: str | None = None
    detected_language: str | None = None
    target_language: str
    translated_text: str
    translations: list[TextTranslationItem]
