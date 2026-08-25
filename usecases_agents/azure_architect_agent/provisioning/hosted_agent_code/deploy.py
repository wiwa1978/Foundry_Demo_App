# Deploys the agent in agent/ to Foundry Agent Service as a
# real Hosted agent (source-code deployment, no Docker).
#
# Reference: "Deploy a hosted agent from source code"
# https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent-code
#
# This is the mechanism that makes the agent show up in the Foundry portal
# under Build > Agents, unlike the local local_chat.py example, which only
# ran in-process and left no server-side trace.
import hashlib
import os
import time
import zipfile
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    CodeConfiguration,
    HostedAgentDefinition,
    ProtocolVersionRecord,
)
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
MODEL_NAME = os.environ["MODEL_NAME"]
AGENT_NAME = "azure-architect-hosted-code"

SOURCE_DIR = Path(__file__).parent / "agent"
ZIP_PATH = Path(__file__).parent / f"{AGENT_NAME}.zip"


def build_zip() -> None:
    """Zip main.py, requirements.txt, and skills/ from the agent source
    folder, as required by the remote_build dependency-resolution mode."""
    # The hosted build expects main.py and requirements.txt at the root of
    # the uploaded archive; skills/<name>/SKILL.md must keep its relative
    # path so main.py's load_skill_instructions() can find it at runtime.
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in ("main.py", "requirements.txt"):
            zf.write(SOURCE_DIR / file, arcname=file)
        skills_dir = SOURCE_DIR / "skills"
        if skills_dir.is_dir():
            for skill_file in skills_dir.rglob("*"):
                if skill_file.is_file():
                    zf.write(skill_file, arcname=skill_file.relative_to(SOURCE_DIR))


def main() -> None:
    """Package, deploy, wait for activation, and smoke-test the agent."""
    build_zip()
    code_zip_bytes = ZIP_PATH.read_bytes()
    code_zip_sha256 = hashlib.sha256(code_zip_bytes).hexdigest()

    # This client creates the Foundry-side hosted-agent version; the runtime
    # itself is launched later by Foundry from the uploaded source package.
    project = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(),
    )

    print(f"Uploading {ZIP_PATH.name} ({len(code_zip_bytes)} bytes)...")
    # The current SDK expects a named binary stream. Path.open() provides both
    # the IO[bytes] type and the .name ending in ".zip" required by the API.
    with ZIP_PATH.open("rb") as code_stream:
        created = project.agents.create_version_from_code(
            agent_name=AGENT_NAME,
            definition=HostedAgentDefinition(
                cpu="0.5",
                memory="1Gi",
                # CodeConfiguration tells Foundry to build the ZIP remotely and
                # start the declared Python entry point.
                code_configuration=CodeConfiguration(
                    runtime="python_3_13",
                    entry_point=["python", "main.py"],
                    dependency_resolution="remote_build",
                ),
                protocol_versions=[
                    ProtocolVersionRecord(protocol="responses", version="2.0.0")
                ],
                environment_variables={
                    "AZURE_AI_MODEL_DEPLOYMENT_NAME": MODEL_NAME,
                    "TOOLBOX_NAME": os.environ["TOOLBOX_NAME"],
                },
            ),
            code=code_stream,
            code_zip_sha256=code_zip_sha256,
            description="Azure architecture assistant with Microsoft Learn MCP access.",
        )
    print(f"Created version: {created.version}")

    # Provisioning is asynchronous, so do not invoke the agent until it is
    # active and surface a terminal provisioning failure immediately.
    print("Waiting for the agent version to become active...")
    for attempt in range(60):
        time.sleep(10)
        version = project.agents.get_version(
            agent_name=AGENT_NAME, agent_version=created.version
        )
        status = version["status"]
        print(f"  Status: {status} (attempt {attempt + 1}/60)")
        if status == "active":
            break
        if status == "failed":
            raise RuntimeError(f"Provisioning failed: {version.get('error')}")
    else:
        raise RuntimeError("Timed out waiting for the agent version to become active.")

    print("\nAgent is active. Sending a test message...")
    openai_client = project.get_openai_client(agent_name=AGENT_NAME)
    response = openai_client.responses.create(
        input="According to Microsoft Learn, what is a Hosted agent?"
    )
    print(f"\nAgent: {response.output_text}")

    print(
        f"\nView it in the portal under Build > Agents > {AGENT_NAME}, "
        f"version {created.version}."
    )


if __name__ == "__main__":
    main()
