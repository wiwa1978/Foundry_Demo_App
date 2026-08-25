import hashlib
import os
import time
import zipfile
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import CodeConfiguration, HostedAgentDefinition, ProtocolVersionRecord
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
MODEL_NAME = os.environ["MODEL_NAME"]
AGENT_NAME = os.getenv("AGENT_NAME", "cloud-cost-review-hosted-pydantic-ai")
SOURCE_DIR = Path(__file__).parent / "agent"
ZIP_PATH = Path(__file__).parent / f"{AGENT_NAME}.zip"


def main() -> None:
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in ("main.py", "requirements.txt"):
            archive.write(SOURCE_DIR / name, arcname=name)
    digest = hashlib.sha256(ZIP_PATH.read_bytes()).hexdigest()
    project = AIProjectClient(endpoint=PROJECT_ENDPOINT, credential=DefaultAzureCredential())
    with ZIP_PATH.open("rb") as code:
        created = project.agents.create_version_from_code(
            agent_name=AGENT_NAME,
            definition=HostedAgentDefinition(
                cpu="0.5",
                memory="1Gi",
                code_configuration=CodeConfiguration(
                    runtime="python_3_13",
                    entry_point=["python", "main.py"],
                    dependency_resolution="remote_build",
                ),
                protocol_versions=[ProtocolVersionRecord(protocol="responses", version="2.0.0")],
                environment_variables={
                    "AZURE_AI_MODEL_DEPLOYMENT_NAME": MODEL_NAME,
                    "TOOLBOX_NAME": os.environ["TOOLBOX_NAME"],
                },
            ),
            code=code,
            code_zip_sha256=digest,
            description="Azure architecture assistant implemented with Pydantic AI.",
        )
    print(f"Created version {created.version} for {AGENT_NAME}.")
    for _ in range(60):
        time.sleep(10)
        version = project.agents.get_version(agent_name=AGENT_NAME, agent_version=created.version)
        if version["status"] == "active":
            return
        if version["status"] == "failed":
            raise RuntimeError(version.get("error"))
    raise RuntimeError("Timed out waiting for the hosted agent to become active.")


if __name__ == "__main__":
    main()
