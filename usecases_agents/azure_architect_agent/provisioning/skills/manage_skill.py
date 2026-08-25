# Creates or updates the "azure-architecture-review" Foundry Skill from the
# canonical SKILL.md in this folder, then promotes the new version to be the
# skill's default version.
#
# Reference: "Use skills with Microsoft Foundry agents (preview)"
# https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/skills
#
# This is the single source of truth for the skill's content. The prompt
# agent consumes it indirectly through a toolbox (see create_toolbox.py). The
# hosted agents (hosted_agent_code, hosted_agent_containers, hosted_agent_azd)
# bundle their own local copy of SKILL.md and load it at startup; use
# download_skill.py to refresh those copies after publishing a new version
# here.
import os
import time
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import SkillInlineContent
from azure.core.exceptions import ResourceExistsError
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

SKILL_NAME = "azure-architecture-review"
SKILL_MD_PATH = Path(__file__).parent / SKILL_NAME / "SKILL.md"
UPLOAD_ATTEMPTS = 12
UPLOAD_RETRY_DELAY_SECONDS = 10


def read_skill_content() -> SkillInlineContent:
    """Convert the canonical SKILL.md into Foundry's inline content model."""
    text = SKILL_MD_PATH.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("SKILL.md must start with YAML front matter.")

    _, _, front_matter_and_body = text.partition("---")
    front_matter, separator, instructions = front_matter_and_body.partition("---")
    if not separator:
        raise ValueError("SKILL.md YAML front matter is not closed.")

    values: dict[str, str] = {}
    for line in front_matter.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            values[key.strip()] = value.strip()

    description = values.get("description")
    if not description:
        raise ValueError("SKILL.md front matter must contain description.")

    return SkillInlineContent(
        description=description,
        instructions=instructions.strip(),
    )


def main() -> None:
    """Upload the skill as a new version and promote it to default."""
    # Skills are a preview feature: the client needs allow_preview=True and
    # every call implicitly sends the required Foundry-Features header.
    project = AIProjectClient(
        endpoint=os.environ["PROJECT_ENDPOINT"],
        credential=DefaultAzureCredential(),
        allow_preview=True,
    )

    print(f"Uploading {SKILL_MD_PATH} as skill '{SKILL_NAME}'...")
    inline_content = read_skill_content()
    for attempt in range(1, UPLOAD_ATTEMPTS + 1):
        try:
            created = project.beta.skills.create(
                name=SKILL_NAME,
                inline_content=inline_content,
            )
            break
        except ResourceExistsError as exc:
            # Foundry keeps a skill locked while its previous create request is
            # processed. This is transient and commonly occurs when a command
            # is retried immediately after a timeout or interrupted upload.
            error_text = f"{exc}\n{getattr(exc, 'message', '')}".lower()
            if "creating" not in error_text or attempt == UPLOAD_ATTEMPTS:
                raise
            print(
                f"Skill is still being created; retrying in "
                f"{UPLOAD_RETRY_DELAY_SECONDS}s "
                f"({attempt}/{UPLOAD_ATTEMPTS - 1})..."
            )
            time.sleep(UPLOAD_RETRY_DELAY_SECONDS)
    else:
        raise RuntimeError("Skill upload did not complete.")

    print(f"Created skill version: {created.name} v{created.version}")

    # The first version of a brand-new skill is auto-promoted, but later runs
    # need an explicit promotion so agents/toolboxes that follow the default
    # version pick up the change without being reconfigured.
    updated = project.beta.skills.update(SKILL_NAME, default_version=created.version)
    print(f"Default version is now: {updated.default_version}")


if __name__ == "__main__":
    main()
