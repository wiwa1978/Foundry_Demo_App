import asyncio
import re
from typing import Any
from urllib.parse import urlparse

from app.azure_credential import get_azure_credential
from app.providers.settings import FoundrySettings
from app.use_case_settings import FoundryBinding

TARGET_LANGUAGE_PATTERN = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?$")
SUPPORTED_TARGET_LANGUAGES = {
    "ar", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pt", "zh-Hans"
}
STANDARD_NEURAL_VOICES = {
    "ar": "ar-SA-ZariyahNeural",
    "de": "de-DE-KatjaNeural",
    "en": "en-US-AvaNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "it": "it-IT-ElsaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "nl": "nl-NL-ColetteNeural",
    "pt": "pt-BR-FranciscaNeural",
    "zh-Hans": "zh-CN-XiaoxiaoNeural",
}


def build_live_interpreter_endpoint(speech_endpoint: str) -> str:
    parsed = urlparse(speech_endpoint.strip())
    if parsed.scheme not in {"http", "https", "ws", "wss"} or not parsed.netloc:
        raise ValueError("AZURE_SPEECH_ENDPOINT must be an absolute resource endpoint.")
    scheme = "wss" if parsed.scheme in {"https", "wss"} else "ws"
    return f"{scheme}://{parsed.netloc}/stt/speech/universal/v2"


class LiveInterpreterSession:
    def __init__(
        self,
        *,
        settings: FoundrySettings,
        binding: FoundryBinding,
        mode: str,
        source_language: str,
        target_language: str,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        target_language = target_language.strip()
        if (
            not TARGET_LANGUAGE_PATTERN.fullmatch(target_language)
            or target_language not in SUPPORTED_TARGET_LANGUAGES
        ):
            raise ValueError("Select a supported target language.")
        import azure.cognitiveservices.speech as speechsdk

        mode = mode.strip().lower()
        if mode not in {"standard", "personal"}:
            raise ValueError("Translation voice mode must be standard or personal.")
        if mode == "standard" and not source_language.strip():
            raise ValueError("Select a source language for standard translation.")
        endpoint = (
            build_live_interpreter_endpoint(binding.speech_endpoint)
            if mode == "personal"
            else binding.speech_endpoint
        )
        if settings.speech_key:
            translation_config = speechsdk.translation.SpeechTranslationConfig(
                endpoint=endpoint,
                subscription=settings.speech_key,
            )
        else:
            translation_config = speechsdk.translation.SpeechTranslationConfig(
                endpoint=endpoint,
                token_credential=get_azure_credential(),
            )
        translation_config.add_target_language(target_language)
        translation_config.voice_name = (
            "personal-voice"
            if mode == "personal"
            else STANDARD_NEURAL_VOICES[target_language]
        )
        if mode == "standard":
            translation_config.speech_recognition_language = source_language.strip()
        translation_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
        )

        stream_format = speechsdk.audio.AudioStreamFormat(
            samples_per_second=16000,
            bits_per_sample=16,
            channels=1,
        )
        self._stream = speechsdk.audio.PushAudioInputStream(stream_format=stream_format)
        audio_config = speechsdk.audio.AudioConfig(stream=self._stream)
        recognizer_options = {
            "translation_config": translation_config,
            "audio_config": audio_config,
        }
        if mode == "personal":
            recognizer_options["auto_detect_source_language_config"] = (
                speechsdk.languageconfig.AutoDetectSourceLanguageConfig()
            )
        self._recognizer = speechsdk.translation.TranslationRecognizer(**recognizer_options)
        self._speechsdk = speechsdk
        self._loop = loop
        self._target_language = target_language
        self._mode = mode
        self.events: asyncio.Queue[tuple[str, Any]] = asyncio.Queue(maxsize=256)
        self._closed = False

        self._recognizer.recognized.connect(self._recognized)
        self._recognizer.synthesizing.connect(self._synthesizing)
        self._recognizer.canceled.connect(self._canceled)
        self._recognizer.session_stopped.connect(
            lambda _evt: self._emit("json", {"type": "session_stopped"})
        )

    def _emit(self, kind: str, payload: Any) -> None:
        def enqueue() -> None:
            if self._closed:
                return
            try:
                self.events.put_nowait((kind, payload))
            except asyncio.QueueFull:
                pass

        self._loop.call_soon_threadsafe(enqueue)

    def _recognized(self, evt: Any) -> None:
        result = evt.result
        if result.reason != self._speechsdk.ResultReason.TranslatedSpeech:
            return
        translation = result.translations.get(self._target_language, "").strip()
        if not translation:
            return
        detected_language = None
        if self._mode == "personal":
            detected_language = result.properties.get_property(
                self._speechsdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult,
                "",
            )
        self._emit(
            "json",
            {
                "type": "translation",
                "text": translation,
                "target_language": self._target_language,
                "detected_language": detected_language or None,
            },
        )

    def _synthesizing(self, evt: Any) -> None:
        audio = bytes(evt.result.audio)
        if audio:
            self._emit("bytes", audio)
        else:
            self._emit("json", {"type": "audio_end"})

    def _canceled(self, evt: Any) -> None:
        details = evt.cancellation_details
        self._emit(
            "json",
            {
                "type": "error",
                "error": details.error_details or f"Live Interpreter was canceled: {details.reason}",
            },
        )

    async def start(self) -> None:
        await asyncio.to_thread(self._recognizer.start_continuous_recognition_async().get)

    def write(self, audio: bytes) -> None:
        if not self._closed and audio:
            self._stream.write(audio)

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._stream.close()
        try:
            await asyncio.wait_for(
                asyncio.to_thread(self._recognizer.stop_continuous_recognition_async().get),
                timeout=10,
            )
        except (TimeoutError, RuntimeError):
            pass
