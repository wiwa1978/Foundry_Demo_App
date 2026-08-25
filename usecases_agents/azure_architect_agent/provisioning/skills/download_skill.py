# Downloads the current default version of the azure-architecture-review
# skill from Foundry and refreshes the local SKILL.md copy bundled with each
# hosted-agent variant.
#
# Run this after publishing a new skill version with manage_skill.py so the
# hosted agents (which read their own local copy at startup, since they have
# no toolbox/MCP resource discovery) pick up the change.
import io
import os
import zipfile
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

SKILL_NAME = "azure-architecture-review"
REPO_ROOT = Path(__file__).parent.parent

# Every hosted variant keeps its own copy of the skill next to its agent code
# so each folder stays self-contained and deployable on its own.
TARGET_SKILL_DIRS = [
    REPO_ROOT / "hosted_agent_code" / "agent" / "skills" / SKILL_NAME,
    REPO_ROOT / "hosted_agent_containers" / "skills" / SKILL_NAME,
    REPO_ROOT / "hosted_agent_azd" / "src" / "azure-architect-hosted-azd" / "skills" / SKILL_NAME,
]


def main() -> None:
    """Download the skill content ZIP and extract SKILL.md into each target."""
    project = AIProjectClient(
        endpoint=os.environ["PROJECT_ENDPOINT"],
        credential=DefaultAzureCredential(),
        allow_preview=True,
    )

    print(f"Downloading default version of skill '{SKILL_NAME}'...")
    zip_bytes = b"".join(project.beta.skills.download_content(SKILL_NAME))

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        skill_md_bytes = archive.read("SKILL.md")

    for target_dir in TARGET_SKILL_DIRS:
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / "SKILL.md"
        target_path.write_bytes(skill_md_bytes)
        print(f"Updated {target_path}")


if __name__ == "__main__":
    main()
