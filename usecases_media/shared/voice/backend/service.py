import asyncio
import base64
import logging
from typing import Any

from app.application.chat import chat_service
from app.application.conversations import (
    append_message,
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.application.models import get_model_settings
from app.core.concurrency import run_model_call
from app.core.errors import ExternalServiceError
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.speech import synthesize_speech, transcribe_audio

logger = logging.getLogger(__name__)


class TraditionalVoiceService:
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

        conversation = get_or_create_conversation(scope, conversation_id, transcript, use_case)
        model_settings = get_model_settings(model)
        variants = chat_service.guardrail_variants(model_settings, False)
        histories = chat_service.guardrail_histories(scope, conversation.id, model, variants)
        user_message = append_message(
            scope=scope,
            conversation_id=conversation.id,
            role="user",
            content=transcript,
        )
        variant_results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    chat_service.run_and_store_variant,
                    scope=scope,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=transcript,
                    system_prompt=model_settings.system_prompt,
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
            "results": results_with_speech,
            "conversation": conversation_to_dict(
                get_conversation(scope, conversation.id) or conversation
            ),
            "user_message": message_to_dict(user_message),
        }
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


traditional_voice_service = TraditionalVoiceService()
