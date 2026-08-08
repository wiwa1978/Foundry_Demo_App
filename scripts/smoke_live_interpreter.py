import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_environment

load_environment()

from app.live_interpreter import LiveInterpreterSession
from app.persistence import initialize_persistence
from app.providers.settings import load_settings
from app.use_case_settings import resolve_use_case_binding


async def main() -> None:
    initialize_persistence()
    binding = resolve_use_case_binding("live_translation")
    if binding is None:
        raise RuntimeError("Live translation binding is not configured.")
    session = LiveInterpreterSession(
        settings=load_settings(),
        binding=binding,
        mode="standard",
        source_language="en-US",
        target_language="fr",
        loop=asyncio.get_running_loop(),
    )
    await session.start()
    print("Live Interpreter session started successfully.")
    await session.close()


if __name__ == "__main__":
    asyncio.run(main())
