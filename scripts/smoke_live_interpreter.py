import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import load_environment

load_environment()

from app.composition import build_application_services
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.persistence.registry import initialize_persistence
from usecases_media.shared.voice.backend.live_interpreter import LiveInterpreterSession


async def main() -> None:
    initialize_persistence()
    services = build_application_services()
    binding = services.use_case_settings.resolve("live_translation")
    if binding is None:
        raise RuntimeError("Live translation binding is not configured.")
    session = LiveInterpreterSession(
        settings=load_settings(
            services.models.list(),
            live_interpreter_configured=True,
        ),
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
