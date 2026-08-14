import asyncio
import base64
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
from collections.abc import AsyncIterator

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect as websocket_connect

from app.core.concurrency import run_model_call
from app.core.errors import ApplicationError, ExternalServiceError, InvalidRequestError
from app.infrastructure.azure.foundry.realtime import (
    create_realtime_transcription_connection_info,
)
from usecases_media.shared.voice.backend.websockets import (
    PCM_BYTES_PER_SAMPLE,
    PCM_SAMPLE_RATE,
    TranscriptionProxyState,
    _assign_sequence,
    _authorize_websocket,
    _commit_transcription_audio,
    _public_provider_error,
    _wait_for_transcription_finalization,
)
from usecases_media.youtube_summary.backend.service import (
    MAX_VIDEO_DURATION_SECONDS,
    extract_video_id,
)

router = APIRouter(tags=["YouTube realtime transcription"])
logger = logging.getLogger(__name__)
PCM_CHUNK_SECONDS = 0.5
PCM_CHUNK_BYTES = int(PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * PCM_CHUNK_SECONDS)
YOUTUBE_COMMIT_SECONDS = 3
YOUTUBE_COMMIT_BYTES = PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * YOUTUBE_COMMIT_SECONDS


def _ensure_ytdlp_available() -> None:
    try:
        import yt_dlp  # noqa: F401
    except ImportError as exc:
        raise InvalidRequestError(
            "YouTube streaming is not installed locally. Install the yt-dlp 2026.07.04 "
            "GitHub tag in the Python environment running FastAPI."
        ) from exc


def _ffmpeg_executable() -> str:
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise InvalidRequestError(
            "Realtime YouTube transcription requires ffmpeg. Install ffmpeg on PATH "
            "or install the Python package imageio-ffmpeg."
        ) from exc
    return imageio_ffmpeg.get_ffmpeg_exe()


def _ytdlp_cookie_arguments() -> list[str]:
    cookie_file = (
        os.getenv("YOUTUBE_COOKIES_FILE") or os.getenv("YT_DLP_COOKIES_FILE") or ""
    ).strip()
    if not cookie_file:
        return []
    return ["--cookies", cookie_file]


def _youtube_audio_pipeline_exception(ytdlp_error: str) -> Exception:
    if "HTTP Error 403" in ytdlp_error or "Forbidden" in ytdlp_error:
        return InvalidRequestError(
            "YouTube blocked audio download (HTTP 403). Realtime transcription requires "
            "downloadable YouTube audio. Export browser cookies to a Netscape cookies.txt "
            "file and set YOUTUBE_COOKIES_FILE to that path, or use a video whose audio "
            "yt-dlp can download."
        )
    return ExternalServiceError("YouTube audio conversion")


def _probe_youtube_video(video_id: str) -> None:
    _ensure_ytdlp_available()
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        probe = subprocess.run(  # noqa: S603
            [
                sys.executable,
                "-m",
                "yt_dlp",
                "--no-playlist",
                "--no-warnings",
                "--socket-timeout",
                "20",
                "--dump-single-json",
                "--skip-download",
                *_ytdlp_cookie_arguments(),
                canonical_url,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        metadata = json.loads(probe.stdout)
        duration = float(metadata.get("duration") or 0)
        if duration <= 0 or duration > MAX_VIDEO_DURATION_SECONDS:
            raise InvalidRequestError(
                "Realtime YouTube transcription supports videos up to 30 minutes long."
            )
    except InvalidRequestError:
        raise
    except (json.JSONDecodeError, OSError, subprocess.SubprocessError) as exc:
        raise ExternalServiceError("YouTube audio stream") from exc


def _youtube_audio_download_command(video_id: str) -> list[str]:
    _ensure_ytdlp_available()
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    return [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--quiet",
        "--socket-timeout",
        "20",
        "--format",
        "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio",
        "--output",
        "-",
        *_ytdlp_cookie_arguments(),
        canonical_url,
    ]


def _ffmpeg_pcm_command(ffmpeg: str) -> list[str]:
    return [
        ffmpeg,
        "-nostdin",
        "-loglevel",
        "error",
        "-re",
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        str(PCM_SAMPLE_RATE),
        "pipe:1",
    ]


async def _pipe_stdout_to_stdin(
    source_process: asyncio.subprocess.Process,
    target_process: asyncio.subprocess.Process,
) -> None:
    source_stdout = source_process.stdout
    target_stdin = target_process.stdin
    if source_stdout is None or target_stdin is None:
        raise ExternalServiceError("YouTube audio conversion")
    try:
        while chunk := await source_stdout.read(64 * 1024):
            target_stdin.write(chunk)
            await target_stdin.drain()
    except (BrokenPipeError, ConnectionResetError, OSError):
        return
    finally:
        target_stdin.close()
        try:
            await target_stdin.wait_closed()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass


async def _process_stderr(process: asyncio.subprocess.Process) -> str:
    if process.stderr is None:
        return ""
    try:
        stderr = await process.stderr.read()
    except (OSError, ValueError):
        return ""
    return stderr.decode(errors="replace").strip()[-1000:]


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    process.terminate()
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except TimeoutError:
        process.kill()
        await process.wait()


def _terminate_popen(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def _popen_stderr(process: subprocess.Popen[bytes]) -> str:
    if process.stderr is None:
        return ""
    try:
        return process.stderr.read().decode(errors="replace").strip()[-1000:]
    except OSError:
        return ""


def _pipe_popen_stdout_to_stdin(
    source_process: subprocess.Popen[bytes],
    target_process: subprocess.Popen[bytes],
    stop_event: threading.Event,
) -> None:
    source_stdout = source_process.stdout
    target_stdin = target_process.stdin
    if source_stdout is None or target_stdin is None:
        return
    try:
        while not stop_event.is_set():
            chunk = source_stdout.read(64 * 1024)
            if not chunk:
                break
            target_stdin.write(chunk)
            target_stdin.flush()
    except (BrokenPipeError, OSError):
        pass
    finally:
        try:
            target_stdin.close()
        except (BrokenPipeError, OSError):
            pass


def _run_popen_youtube_pcm_pipeline(
    *,
    video_id: str,
    ffmpeg: str,
    loop: asyncio.AbstractEventLoop,
    queue: asyncio.Queue[bytes | Exception | None],
    stop_event: threading.Event,
    processes: list[subprocess.Popen[bytes]],
) -> None:
    ytdlp_process: subprocess.Popen[bytes] | None = None
    ffmpeg_process: subprocess.Popen[bytes] | None = None
    pipe_thread: threading.Thread | None = None

    def publish(item: bytes | Exception | None) -> None:
        try:
            loop.call_soon_threadsafe(queue.put_nowait, item)
        except RuntimeError:
            pass

    try:
        ytdlp_process = subprocess.Popen(  # noqa: S603
            _youtube_audio_download_command(video_id),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        processes.append(ytdlp_process)
        ffmpeg_process = subprocess.Popen(  # noqa: S603
            _ffmpeg_pcm_command(ffmpeg),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        processes.append(ffmpeg_process)
        pipe_thread = threading.Thread(
            target=_pipe_popen_stdout_to_stdin,
            args=(ytdlp_process, ffmpeg_process, stop_event),
            daemon=True,
        )
        pipe_thread.start()

        ffmpeg_stdout = ffmpeg_process.stdout
        if ffmpeg_stdout is None:
            raise ExternalServiceError("YouTube audio conversion")
        while not stop_event.is_set():
            chunk = ffmpeg_stdout.read(PCM_CHUNK_BYTES)
            if not chunk:
                break
            publish(chunk)
        if stop_event.is_set():
            return

        ffmpeg_return_code = ffmpeg_process.wait()
        if ffmpeg_return_code != 0 and ytdlp_process.poll() is None:
            _terminate_popen(ytdlp_process)
        else:
            ytdlp_process.wait()
        if pipe_thread is not None:
            pipe_thread.join(timeout=5)
        if ffmpeg_return_code != 0 or ytdlp_process.returncode != 0:
            ffmpeg_error = _popen_stderr(ffmpeg_process)
            ytdlp_error = _popen_stderr(ytdlp_process)
            logger.warning(
                "youtube_audio_pipeline_failed ffmpeg_return_code=%s ytdlp_return_code=%s ffmpeg_error=%s ytdlp_error=%s",
                ffmpeg_return_code,
                ytdlp_process.returncode,
                ffmpeg_error,
                ytdlp_error,
            )
            raise _youtube_audio_pipeline_exception(ytdlp_error)
    except Exception as exc:
        publish(exc)
    finally:
        stop_event.set()
        for process in processes:
            _terminate_popen(process)
        if pipe_thread is not None and pipe_thread.is_alive():
            pipe_thread.join(timeout=5)
        publish(None)


async def _stream_youtube_pcm24_with_popen(video_id: str, ffmpeg: str) -> AsyncIterator[bytes]:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes | Exception | None] = asyncio.Queue()
    stop_event = threading.Event()
    processes: list[subprocess.Popen[bytes]] = []
    worker = threading.Thread(
        target=_run_popen_youtube_pcm_pipeline,
        kwargs={
            "video_id": video_id,
            "ffmpeg": ffmpeg,
            "loop": loop,
            "queue": queue,
            "stop_event": stop_event,
            "processes": processes,
        },
        daemon=True,
    )
    worker.start()
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    finally:
        stop_event.set()
        for process in processes:
            _terminate_popen(process)
        if worker.is_alive():
            await asyncio.to_thread(worker.join, 5)


async def _stream_youtube_pcm24_with_async_subprocesses(
    video_id: str, ffmpeg: str
) -> AsyncIterator[bytes]:
    ytdlp_process: asyncio.subprocess.Process | None = None
    ffmpeg_process: asyncio.subprocess.Process | None = None
    pipe_task: asyncio.Task[None] | None = None
    try:
        ytdlp_process = await asyncio.create_subprocess_exec(
            *_youtube_audio_download_command(video_id),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        ffmpeg_process = await asyncio.create_subprocess_exec(
            *_ffmpeg_pcm_command(ffmpeg),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        pipe_task = asyncio.create_task(_pipe_stdout_to_stdin(ytdlp_process, ffmpeg_process))
        ffmpeg_stdout = ffmpeg_process.stdout
        if ffmpeg_stdout is None:
            raise ExternalServiceError("YouTube audio conversion")
        while chunk := await ffmpeg_stdout.read(PCM_CHUNK_BYTES):
            yield chunk
        ffmpeg_return_code = await ffmpeg_process.wait()
        if ffmpeg_return_code != 0 and ytdlp_process.returncode is None:
            await _terminate_process(ytdlp_process)
        else:
            await ytdlp_process.wait()
        await pipe_task
        if ffmpeg_return_code != 0 or ytdlp_process.returncode != 0:
            ffmpeg_error = await _process_stderr(ffmpeg_process)
            ytdlp_error = await _process_stderr(ytdlp_process)
            logger.warning(
                "youtube_audio_pipeline_failed ffmpeg_return_code=%s ytdlp_return_code=%s ffmpeg_error=%s ytdlp_error=%s",
                ffmpeg_return_code,
                ytdlp_process.returncode,
                ffmpeg_error,
                ytdlp_error,
            )
            raise _youtube_audio_pipeline_exception(ytdlp_error)
    finally:
        if pipe_task is not None and not pipe_task.done():
            pipe_task.cancel()
            try:
                await pipe_task
            except asyncio.CancelledError:
                pass
        if ffmpeg_process is not None:
            await _terminate_process(ffmpeg_process)
        if ytdlp_process is not None:
            await _terminate_process(ytdlp_process)


async def stream_youtube_pcm24(video_id: str) -> AsyncIterator[bytes]:
    ffmpeg = _ffmpeg_executable()
    await asyncio.to_thread(_probe_youtube_video, video_id)
    try:
        async for chunk in _stream_youtube_pcm24_with_async_subprocesses(video_id, ffmpeg):
            yield chunk
    except NotImplementedError:
        logger.info("asyncio_subprocess_unavailable_using_threaded_youtube_pipeline")
        async for chunk in _stream_youtube_pcm24_with_popen(video_id, ffmpeg):
            yield chunk


async def _relay_youtube_audio(
    *,
    upstream,
    websocket: WebSocket,
    state: TranscriptionProxyState,
    pcm_audio: AsyncIterator[bytes],
) -> None:
    await _send_status(websocket, "Opening YouTube audio stream...")
    streamed_bytes = 0
    async for chunk in pcm_audio:
        for offset in range(0, len(chunk), PCM_CHUNK_BYTES):
            audio = chunk[offset : offset + PCM_CHUNK_BYTES]
            if not audio:
                continue
            streamed_bytes += len(audio)
            async with state.send_lock:
                await upstream.send(
                    json.dumps(
                        {
                            "type": "input_audio_buffer.append",
                            "audio": base64.b64encode(audio).decode("ascii"),
                        }
                    )
                )
                state.uncommitted_audio_bytes += len(audio)
                state.uncommitted_has_speech = True
            if state.uncommitted_audio_bytes >= YOUTUBE_COMMIT_BYTES:
                await _commit_transcription_audio(upstream, state)
            await asyncio.sleep(0)
    if streamed_bytes == 0:
        raise InvalidRequestError("The YouTube audio stream was empty.")
    await _commit_transcription_audio(upstream, state, force=True)
    await _wait_for_transcription_finalization(state)
    await websocket.send_json({"type": "youtube.completed"})


def _youtube_realtime_options(websocket: WebSocket) -> tuple[str, str | None, str | None, str]:
    url = websocket.query_params.get("url", "").strip()
    language = websocket.query_params.get("language")
    delay = websocket.query_params.get("delay")
    model = websocket.query_params.get("model", "").strip()
    if not url:
        raise InvalidRequestError("Enter a YouTube URL to transcribe.")
    if not model:
        raise InvalidRequestError("Select a realtime transcription model.")
    return url, language, delay, model


def _youtube_realtime_error_message(exc: Exception) -> str:
    if isinstance(exc, ApplicationError):
        logger.warning(
            "youtube_realtime_transcription_rejected code=%s detail=%s",
            exc.code,
            exc.detail,
        )
        return exc.detail
    return _public_provider_error("YouTube realtime transcription", exc)


async def _send_status(websocket: WebSocket, status: str) -> None:
    await websocket.send_json({"type": "youtube.status", "status": status})


async def _relay_transcripts_to_browser(
    *, upstream, websocket: WebSocket, state: TranscriptionProxyState
) -> None:
    async for message in upstream:
        if isinstance(message, bytes):
            continue
        event = json.loads(message)
        event_type = event.get("type")
        item_id = event.get("item_id")
        if event_type == "input_audio_buffer.committed":
            sequence = _assign_sequence(state, item_id)
            if item_id:
                state.pending_items.add(item_id)
                state.finalization_event.set()
            await websocket.send_json(
                {"type": "audio.committed", "item_id": item_id, "sequence": sequence}
            )
            continue
        if event_type in {
            "conversation.item.input_audio_transcription.delta",
            "conversation.item.input_audio_transcription.completed",
            "conversation.item.input_audio_transcription.failed",
        }:
            event["sequence"] = _assign_sequence(state, item_id)
            if item_id:
                if event_type.endswith((".completed", ".failed")):
                    state.pending_items.discard(item_id)
                else:
                    state.pending_items.add(item_id)
                state.finalization_event.set()
        if event_type in {
            "conversation.item.input_audio_transcription.delta",
            "conversation.item.input_audio_transcription.completed",
            "conversation.item.input_audio_transcription.failed",
            "response.text.done",
            "input_audio_buffer.speech_started",
            "input_audio_buffer.speech_stopped",
            "error",
        }:
            await websocket.send_json(event)


@router.websocket("/api/youtube/realtime-transcribe")
async def youtube_realtime_transcription(websocket: WebSocket) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept()
    state = TranscriptionProxyState()
    try:
        url, language, delay, model = _youtube_realtime_options(websocket)
        video_id = extract_video_id(url)
        await _send_status(websocket, "Opening realtime transcription session...")
        connection = await run_model_call(
            create_realtime_transcription_connection_info,
            model=model,
            language=language,
            delay=delay,
        )
        async with websocket_connect(
            connection["url"],
            additional_headers={"Authorization": f"Bearer {connection['token']}"},
            max_size=None,
        ) as upstream:
            await upstream.send(json.dumps(connection["session_update"]))
            await websocket.send_json(
                {
                    "type": "ready",
                    "model": connection["model"],
                    "input_rate": PCM_SAMPLE_RATE,
                    "video_id": video_id,
                }
            )
            tasks = {
                asyncio.create_task(
                    _relay_youtube_audio(
                        upstream=upstream,
                        websocket=websocket,
                        state=state,
                        pcm_audio=stream_youtube_pcm24(video_id),
                    )
                ),
                asyncio.create_task(
                    _relay_transcripts_to_browser(
                        upstream=upstream,
                        websocket=websocket,
                        state=state,
                    )
                ),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "error": {"message": _youtube_realtime_error_message(exc)},
                }
            )
            await websocket.close(code=1011)
        except (RuntimeError, WebSocketDisconnect):
            pass
