import asyncio
import base64
import logging
from typing import Any

from app.application.chat import ChatService
from app.application.conversation_messages import append_message
from app.application.conversations import (
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.application.models import get_model_settings
from app.core.concurrency import run_model_call
from app.core.errors import ExternalServiceError
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.speech import (
    assess_pronunciation,
    synthesize_speech,
    transcribe_audio,
)

logger = logging.getLogger(__name__)


class TraditionalVoiceService:
    def __init__(self, chat: ChatService) -> None:
        self.chat = chat

    async def process(
        self,
        *,
        scope: UserScope,
        audio: bytes,
        filename: str,
        content_type: str | None,
        model: str,
        transcription_model: str | None,
        tts_model: str | None,
        tts_voice: str | None,
        conversation_id: str | None,
        reasoning_effort: str | None,
        use_case: str,
        language: str = "en-US",
    ) -> dict[str, Any]:
        try:
            transcription = await run_model_call(
                transcribe_audio,
                audio=audio,
                filename=filename,
                content_type=content_type,
                model=transcription_model,
            )
        except Exception as exc:
            raise ExternalServiceError("Audio transcription") from exc
        transcript = transcription["text"].strip()
        if not transcript:
            raise ExternalServiceError("Audio transcription")

        pronunciation_assessment: dict[str, Any] | None = None
        pronunciation_assessment_error: str | None = None
        if use_case == "language_learning":
            try:
                pronunciation_assessment = await run_model_call(
                    assess_pronunciation,
                    audio=audio,
                    reference_text=transcript,
                    language=language,
                )
            except Exception as exc:
                logger.exception("Pronunciation assessment failed", exc_info=exc)
                pronunciation_assessment_error = (
                    "Pronunciation assessment is unavailable for this turn."
                )

        conversation = get_or_create_conversation(
            self.chat.conversations, scope, conversation_id, transcript, use_case
        )
        model_settings = get_model_settings(self.chat.models, model)
        variants = self.chat.guardrail_variants(model_settings, False)
        histories = self.chat.guardrail_histories(scope, conversation.id, model, variants)
        user_message = append_message(
            self.chat.conversations,
            scope=scope,
            conversation_id=conversation.id,
            role="user",
            content=transcript,
        )
        system_prompt = model_settings.system_prompt
        tutor_context = transcript
        if use_case == "language_learning":
            language_name = {
                "de-DE": "German",
                "en-GB": "English",
                "en-US": "English",
                "es-ES": "Spanish",
                "fr-FR": "French",
                "nl-NL": "Dutch",
            }.get(language, language)
            system_prompt = (
                f"You are a patient, encouraging {language_name} language teacher. "
                f"Reply in {language_name}. Correct important grammar and vocabulary errors briefly, "
                "model a natural version of the learner's sentence, and end with one "
                "short question or speaking exercise. Use the pronunciation assessment "
                "provided in the learner context when giving actionable feedback.\n\n"
                + system_prompt
            )
            tutor_context = (
                f"{transcript}\n\nPronunciation assessment: "
                f"{pronunciation_assessment or pronunciation_assessment_error or 'not available'}"
            )
        variant_results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    self.chat.run_and_store_variant,
                    scope=scope,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=tutor_context,
                    system_prompt=system_prompt,
                    reasoning_effort=reasoning_effort,
                    history=histories[variant],
                    variant=variant,
                    policy_name=policy_name,
                )
                for variant, policy_name in variants
            )
        )
        results_with_speech = await asyncio.gather(
            *(
                self._add_speech(result, model=tts_model, voice=tts_voice)
                for result in variant_results
            )
        )

        payload: dict[str, Any] = {
            "model": model,
            "transcription": transcription,
            "transcript": transcript,
            "results": results_with_speech,
            "conversation": conversation_to_dict(
                get_conversation(self.chat.conversations, scope, conversation.id) or conversation
            ),
            "user_message": message_to_dict(user_message),
        }
        if pronunciation_assessment is not None:
            payload["pronunciation_assessment"] = pronunciation_assessment
        if pronunciation_assessment_error is not None:
            payload["pronunciation_assessment_error"] = pronunciation_assessment_error
        if len(results_with_speech) == 1:
            result = results_with_speech[0]
            payload.update(result)
            payload["chat"] = {
                key: value
                for key, value in result.items()
                if key not in {"assistant_message", "speech"}
            }
        return payload

    async def _add_speech(
        self,
        result: dict[str, Any],
        *,
        model: str | None,
        voice: str | None,
    ) -> dict[str, Any]:
        if result.get("error") or not result.get("content"):
            return result
        try:
            speech = await run_model_call(
                synthesize_speech,
                text=result["content"],
                model=model,
                voice=voice,
            )
        except Exception as exc:
            logger.exception("Speech synthesis failed", exc_info=exc)
            return {**result, "speech_error": "Speech synthesis failed. Try again later."}
        return {
            **result,
            "speech": {
                **{key: value for key, value in speech.items() if key != "audio"},
                "audio_base64": base64.b64encode(speech["audio"]).decode("ascii"),
            },
        }
