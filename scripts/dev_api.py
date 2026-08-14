from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT_PATH = str(PROJECT_ROOT)
if PROJECT_ROOT_PATH not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_PATH)


RELOAD_DIRS = ("app", "usecases_agents", "usecases_media")
RELOAD_EXCLUDES = (
    "*-DESKTOP-*",
    ".venv/*",
    "frontend/node_modules/*",
    "frontend/dist/*",
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the FastAPI backend with reload scoped to source directories."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Run without the development file watcher.",
    )
    args = parser.parse_args()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        reload_dirs=[] if args.no_reload else [str(PROJECT_ROOT / path) for path in RELOAD_DIRS],
        reload_excludes=[] if args.no_reload else list(RELOAD_EXCLUDES),
        app_dir=PROJECT_ROOT_PATH,
    )


if __name__ == "__main__":
    main()
