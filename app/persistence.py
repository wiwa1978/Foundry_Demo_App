import os


def persistence_backend() -> str:
    backend = os.getenv("PERSISTENCE_BACKEND", "sqlite").strip().lower()
    if backend not in {"sqlite", "cosmos"}:
        raise RuntimeError("PERSISTENCE_BACKEND must be 'sqlite' or 'cosmos'.")
    return backend
