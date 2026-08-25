import asyncio
import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.errors import ExternalServiceError, InvalidRequestError
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.azure.foundry.speech import (
    synthesize_azure_speech,
    transcribe_speech_audio,
)
from usecases_media.text_translation.backend.schemas import TextTranslationRequest
from usecases_media.text_translation.backend.service import translate_text

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_OUTPUT_BYTES = 150 * 1024 * 1024
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
VOICE_BY_LANGUAGE = {
    "en": ("en-US", "en-US-Ava:DragonHDLatestNeural"),
    "es": ("es-ES", "es-ES-ElviraNeural"),
    "fr": ("fr-FR", "fr-FR-DeniseNeural"),
    "de": ("de-DE", "de-DE-KatjaNeural"),
    "nl": ("nl-NL", "nl-NL-ColetteNeural"),
    "it": ("it-IT", "it-IT-ElsaNeural"),
    "pt": ("pt-BR", "pt-BR-FranciscaNeural"),
    "ja": ("ja-JP", "ja-JP-NanamiNeural"),
    "ko": ("ko-KR", "ko-KR-SunHiNeural"),
    "zh": ("zh-CN", "zh-CN-XiaoxiaoNeural"),
}


def validate_video_filename(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise InvalidRequestError("Upload an MP4, MOV, M4V, WebM, MKV, or AVI video.")
    return suffix


def _run_ffmpeg(args: list[str], *, operation: str, timeout: int = 180) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ExternalServiceError("Video translation (ffmpeg is not installed)")
    try:
        subprocess.run([ffmpeg, "-nostdin", "-loglevel", "error", *args], check=True,
                       capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError) as exc:
        raise ExternalServiceError(operation) from exc


async def translate_and_dub_video(
    *,
    video: bytes,
    filename: str | None,
    source_language: str | None,
    target_language: str,
    voice: str | None,
    transcription_model: str | None,
) -> dict:
    validate_video_filename(filename)
    source_language = source_language.strip() if source_language else None
    if source_language and source_language.lower() == "auto":
        source_language = None
    target_language = target_language.strip()
    if not 2 <= len(target_language) <= 35:
        raise InvalidRequestError("Choose a valid target language.")
    if not video or len(video) > MAX_UPLOAD_BYTES:
        raise InvalidRequestError("Video must be between 1 byte and 100 MB.")
    settings = load_settings()
    model = (transcription_model or settings.speech_transcription_model or "").strip()
    if not model:
        raise InvalidRequestError("Configure a speech transcription model before dubbing a video.")
    key = target_language.lower().split("-", 1)[0]
    language, default_voice = VOICE_BY_LANGUAGE.get(key, (target_language, ""))
    selected_voice = (voice or default_voice).strip()
    if not selected_voice:
        raise InvalidRequestError("Select a supported target language or provide a voice.")
    with tempfile.TemporaryDirectory(prefix="video-translation-") as directory:
        root = Path(directory)
        source = root / "source.video"
        wav = root / "speech.wav"
        dubbed = root / "dubbed.mp3"
        output = root / "dubbed.mp4"
        source.write_bytes(video)
        _run_ffmpeg(["-i", str(source), "-vn", "-ac", "1", "-ar", "16000", str(wav)],
                    operation="Video translation audio extraction")
        transcription = await asyncio.to_thread(
            transcribe_speech_audio, audio=wav.read_bytes(),
            language=source_language or "en-US", model=model)
        transcript = str(transcription.get("text", "")).strip()
        if not transcript:
            raise ExternalServiceError("Video translation transcription")
        translated = await translate_text(TextTranslationRequest(
            text=transcript, source_language=source_language, target_language=target_language))
        translated_text = str(translated["translated_text"]).strip()
        speech = await asyncio.to_thread(
            synthesize_azure_speech, text=translated_text, voice=selected_voice, language=language)
        dubbed.write_bytes(speech["audio"])
        _run_ffmpeg(["-i", str(source), "-i", str(dubbed), "-map", "0:v:0", "-map", "1:a:0",
                     "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart",
                     str(output)], operation="Video translation muxing")
        result = output.read_bytes()
    if len(result) > MAX_OUTPUT_BYTES:
        raise InvalidRequestError("The dubbed video exceeded the output size limit.")
    return {"transcript": transcript, "translated_text": translated_text,
            "source_language": source_language, "target_language": target_language,
            "voice": selected_voice, "video_base64": base64.b64encode(result).decode("ascii"),
            "video_mime_type": "video/mp4", "transcription_model": model}
