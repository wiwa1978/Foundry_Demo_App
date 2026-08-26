import asyncio
import base64
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.core.errors import ExternalServiceError, InvalidRequestError
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.azure.foundry.speech import (
    synthesize_azure_speech,
    transcribe_speech_audio,
    transcribe_speech_audio_with_timings,
)
from usecases_media.text_translation.backend.schemas import TextTranslationRequest
from usecases_media.text_translation.backend.service import translate_text

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_OUTPUT_BYTES = 150 * 1024 * 1024
MEDIA_EXTENSIONS = {
    ".avi",
    ".flac",
    ".m4a",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".wav",
    ".webm",
}
VIDEO_EXTENSIONS = {".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"}
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


def validate_media_filename(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in MEDIA_EXTENSIONS:
        raise InvalidRequestError(
            "Upload a supported audio or video file "
            "(MP3, WAV, M4A, MP4, MOV, WebM, MKV, or AVI)."
        )
    return suffix


def validate_video_filename(filename: str | None) -> str:
    suffix = validate_media_filename(filename)
    if suffix not in VIDEO_EXTENSIONS:
        raise InvalidRequestError("Upload an MP4, MOV, M4V, WebM, MKV, or AVI video.")
    return suffix


def _run_ffmpeg(args: list[str], *, operation: str, timeout: int = 180) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ExternalServiceError(f"{operation} (ffmpeg is not installed)")
    try:
        subprocess.run(
            [ffmpeg, "-nostdin", "-loglevel", "error", *args],
            check=True,
            capture_output=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise ExternalServiceError(operation) from exc


def extract_audio(media: bytes, filename: str | None) -> bytes:
    validate_media_filename(filename)
    if not media or len(media) > MAX_UPLOAD_BYTES:
        raise InvalidRequestError("Media must be between 1 byte and 100 MB.")
    with tempfile.TemporaryDirectory(prefix="media-speech-") as directory:
        root = Path(directory)
        source = root / f"source{Path(filename or '').suffix.lower()}"
        wav = root / "speech.wav"
        source.write_bytes(media)
        _run_ffmpeg(
            ["-i", str(source), "-vn", "-ac", "1", "-ar", "16000", str(wav)],
            operation="Media audio extraction",
        )
        return wav.read_bytes()


def _speech_language(language: str | None) -> str:
    selected = (language or "en-US").strip()
    return "en-US" if not selected or selected.lower() == "auto" else selected


def _transcription_model(model: str | None) -> str:
    settings = load_settings()
    selected = (model or settings.speech_transcription_model or "").strip()
    if not selected:
        raise InvalidRequestError("Configure an Azure Speech transcription model first.")
    return selected


def _format_caption_time(milliseconds: int, separator: str) -> str:
    total_ms = max(0, int(milliseconds))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{separator}{millis:03d}"


def _caption_formats(
    segments: list[dict[str, Any]],
) -> tuple[str, str, list[dict[str, Any]]]:
    cues: list[dict[str, Any]] = []
    for segment in segments:
        text = " ".join(str(segment.get("text", "")).split())
        if not text:
            continue
        start_ms = max(0, int(segment.get("offset_ms", 0)))
        duration_ms = max(1, int(segment.get("duration_ms", 1)))
        cues.append(
            {
                "index": len(cues) + 1,
                "start_ms": start_ms,
                "end_ms": start_ms + duration_ms,
                "text": text,
            }
        )
    if not cues:
        raise ExternalServiceError("Captioning transcription")
    vtt = "WEBVTT\n\n" + "\n\n".join(
        f"{_format_caption_time(cue['start_ms'], '.')} --> "
        f"{_format_caption_time(cue['end_ms'], '.')}\n{cue['text']}"
        for cue in cues
    )
    srt = "\n\n".join(
        f"{index}\n{_format_caption_time(cue['start_ms'], ',')} --> "
        f"{_format_caption_time(cue['end_ms'], ',')}\n{cue['text']}"
        for index, cue in enumerate(cues, start=1)
    ) + "\n"
    return vtt, srt, cues


async def caption_media(
    *,
    media: bytes,
    filename: str | None,
    language: str,
    transcription_model: str | None,
) -> dict[str, Any]:
    audio = await asyncio.to_thread(extract_audio, media, filename)
    model = _transcription_model(transcription_model)
    transcription = await asyncio.to_thread(
        transcribe_speech_audio_with_timings,
        audio=audio,
        language=_speech_language(language),
        model=model,
    )
    transcript = str(transcription.get("text", "")).strip()
    if not transcript:
        raise ExternalServiceError("Captioning transcription")
    webvtt, srt, cues = _caption_formats(transcription["segments"])
    return {
        "transcript": transcript,
        "language": transcription["language"],
        "transcription_model": model,
        "captions": cues,
        "webvtt": webvtt,
        "srt": srt,
    }


async def translate_and_dub_audio(
    *,
    media: bytes,
    filename: str | None,
    source_language: str | None,
    target_language: str,
    voice: str | None,
    transcription_model: str | None,
) -> dict[str, Any]:
    audio = await asyncio.to_thread(extract_audio, media, filename)
    model = _transcription_model(transcription_model)
    source = _speech_language(source_language)
    target = target_language.strip()
    if not 2 <= len(target) <= 35:
        raise InvalidRequestError("Choose a valid target language.")
    key = target.lower().split("-", 1)[0]
    language, default_voice = VOICE_BY_LANGUAGE.get(key, (target, ""))
    selected_voice = (voice or default_voice).strip()
    if not selected_voice:
        raise InvalidRequestError("Select a supported target language or provide a voice.")
    transcription = await asyncio.to_thread(
        transcribe_speech_audio, audio=audio, language=source, model=model
    )
    transcript = str(transcription.get("text", "")).strip()
    if not transcript:
        raise ExternalServiceError("Dubbing transcription")
    translated = await translate_text(
        TextTranslationRequest(
            text=transcript,
            source_language=source_language,
            target_language=target,
        )
    )
    translated_text = str(translated["translated_text"]).strip()
    speech = await asyncio.to_thread(
        synthesize_azure_speech,
        text=translated_text,
        voice=selected_voice,
        language=language,
    )
    return {
        "transcript": transcript,
        "translated_text": translated_text,
        "source_language": source_language,
        "target_language": target,
        "voice": selected_voice,
        "audio_base64": base64.b64encode(speech["audio"]).decode("ascii"),
        "audio_mime_type": speech.get("audio_mime_type", "audio/mpeg"),
        "transcription_model": model,
    }


async def translate_and_dub_video(
    *,
    video: bytes,
    filename: str | None,
    source_language: str | None,
    target_language: str,
    voice: str | None,
    transcription_model: str | None,
) -> dict[str, Any]:
    validate_video_filename(filename)
    if not video or len(video) > MAX_UPLOAD_BYTES:
        raise InvalidRequestError("Video must be between 1 byte and 100 MB.")
    dubbed_audio = await translate_and_dub_audio(
        media=video,
        filename=filename,
        source_language=source_language,
        target_language=target_language,
        voice=voice,
        transcription_model=transcription_model,
    )
    audio_bytes = base64.b64decode(dubbed_audio["audio_base64"])
    with tempfile.TemporaryDirectory(prefix="video-translation-") as directory:
        root = Path(directory)
        source = root / "source.video"
        dubbed = root / "dubbed.mp3"
        output = root / "translated-video.mp4"
        source.write_bytes(video)
        dubbed.write_bytes(audio_bytes)
        _run_ffmpeg(
            [
                "-i",
                str(source),
                "-i",
                str(dubbed),
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-shortest",
                "-movflags",
                "+faststart",
                str(output),
            ],
            operation="Video translation muxing",
        )
        result = output.read_bytes()
    if len(result) > MAX_OUTPUT_BYTES:
        raise InvalidRequestError("The translated video exceeded the output size limit.")
    return {
        **{key: value for key, value in dubbed_audio.items() if key != "audio_base64"},
        "video_base64": base64.b64encode(result).decode("ascii"),
        "video_mime_type": "video/mp4",
    }
