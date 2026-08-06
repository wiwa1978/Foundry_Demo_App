import threading

from app.config import load_runtime_settings


MODEL_CALL_CONCURRENCY = load_runtime_settings().model_call_concurrency
model_call_semaphore = threading.BoundedSemaphore(MODEL_CALL_CONCURRENCY)
