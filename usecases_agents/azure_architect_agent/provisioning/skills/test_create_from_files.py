"""Minimal reproduction for Foundry Skills create_from_files."""

import io
import os
from importlib.metadata import version
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import CreateSkillVersionFromFilesBody
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv


SKILLS_DIR = Path(__file__).parent
EXPERIMENTS_DIR = SKILLS_DIR.parent
SKILL_NAME = os.getenv("SKILL_NAME", "skill-file-repro")
SKILL_PATH = SKILLS_DIR / "azure-architecture-review" / "SKILL.md"


def main() -> None:
    """Upload a local SKILL.md through the multipart SDK operation."""
    load_dotenv(EXPERIMENTS_DIR / ".env")

    print(f"azure-ai-projects=={version('azure-ai-projects')}")
    print(f"Uploading {SKILL_PATH} as skill '{SKILL_NAME}'...")

    skill_content = SKILL_PATH.read_bytes()
    project = AIProjectClient(
        endpoint=os.environ["PROJECT_ENDPOINT"],
        credential=DefaultAzureCredential(),
        allow_preview=True,
    )

    # The SDK converts this model into multipart/form-data with a files part
    # and a default flag. The uploaded SKILL.md must contain YAML front matter.
    request = CreateSkillVersionFromFilesBody(
        files=[
            (
                "SKILL.md",
                io.BytesIO(skill_content),
                "text/markdown",
            )
        ],
        default=True,
    )

    created = project.beta.skills.create_from_files(
        name=SKILL_NAME,
        content=request,
    )

    print(f"Created skill version: {created.name} v{created.version}")


if __name__ == "__main__":
    main()
