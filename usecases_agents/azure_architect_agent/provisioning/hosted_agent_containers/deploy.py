import os
import time

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    ContainerConfiguration,
    HostedAgentDefinition,
    ProtocolVersionRecord,
)
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv


# Deployment settings are kept in .env so the same script can register
# different images, projects, or agent names without source changes.
load_dotenv()

PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
MODEL_NAME = os.environ["MODEL_NAME"]
AGENT_NAME = os.getenv("AGENT_NAME", "azure-architect-hosted-container")
CONTAINER_IMAGE = os.environ["CONTAINER_IMAGE"]


def main() -> None:
    """Register an already-pushed ACR image as a Foundry hosted-agent version."""
    project = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(),
    )
    created = project.agents.create_version(
        agent_name=AGENT_NAME,
        definition=HostedAgentDefinition(
            cpu="1",
            memory="2Gi",
            # Foundry pulls and runs this image from ACR; no ZIP or remote
            # Python dependency build is used for this variant.
            container_configuration=ContainerConfiguration(image=CONTAINER_IMAGE),
            protocol_versions=[
                ProtocolVersionRecord(protocol="responses", version="2.0.0")
            ],
            environment_variables={
                "AZURE_AI_MODEL_DEPLOYMENT_NAME": MODEL_NAME,
            },
        ),
        description="Azure architecture assistant deployed from a container image.",
    )
    print(f"Created version: {created.version}")
    print("Waiting for the hosted agent version to become active...")
    for attempt in range(60):
        time.sleep(10)
        version = project.agents.get_version(
            agent_name=AGENT_NAME,
            agent_version=created.version,
        )
        status = version["status"]
        print(f"  Status: {status} (attempt {attempt + 1}/60)")
        if status == "active":
            print(f"Agent is active: {AGENT_NAME} version {created.version}")
            break
        if status == "failed":
            raise RuntimeError(f"Hosted agent provisioning failed: {version.get('error')}")
    else:
        raise RuntimeError("Timed out waiting for the hosted agent to become active.")

    print("Sending smoke-test request...")
    openai_client = project.get_openai_client(agent_name=AGENT_NAME)
    response = openai_client.responses.create(
        input="Briefly explain when to choose Azure Container Apps over AKS."
    )
    print(f"Smoke test response: {response.output_text}")
    print(f"View it in the portal under Build > Agents > {AGENT_NAME}.")


if __name__ == "__main__":
    main()
