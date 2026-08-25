"""Identifiers and helpers shared by the Investment Planner provisioning scripts.

These scripts run locally (author time) with your `az login` identity. They are deliberately
independent of the FastAPI app: nothing here is imported by `app/`.
"""

import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

AGENT_NAME = os.environ.get("FOUNDRY_INVESTMENT_PLANNER_AGENT_NAME", "investment-planner")

# Toolbox the skills are attached to. Created on the first provision_skills.py run.
TOOLBOX_NAME = "investment-skills"

# Project connection (category RemoteTool, AgenticIdentityToken auth) fronting the toolbox MCP
# endpoint. The prompt agent references the toolbox only through this connection.
TOOLBOX_CONNECTION_NAME = "investment-skills-toolbox"

SKILLS_DIR = Path(__file__).parent / "skills"

# Built-in role definition ids granted to the agent identity after the agent exists.
ROLE_STORAGE_BLOB_DATA_READER = "2a2b9908-6ea1-4ae2-8e65-a410df84e7d1"
ROLE_FOUNDRY_USER = "53ca6127-db72-4b80-b1b0-d745d6d5456d"


def run_az(args: list[str]) -> subprocess.CompletedProcess:
    """Run the Azure CLI without a shell so JSON bodies and paths are not mangled."""
    executable = shutil.which("az") or "az"
    return subprocess.run([executable, *args], capture_output=True, text=True)


def project_endpoint() -> str:
    endpoint = os.environ.get("FOUNDRY_PROJECT_ENDPOINT") or os.environ.get(
        "AZURE_AI_PROJECT_ENDPOINT"
    )
    if not endpoint:
        raise SystemExit(
            "Set FOUNDRY_PROJECT_ENDPOINT "
            "(https://<resource>.services.ai.azure.com/api/projects/<project>)."
        )
    return endpoint.rstrip("/")


def toolbox_mcp_url(endpoint: str) -> str:
    return f"{endpoint.rstrip('/')}/toolboxes/{TOOLBOX_NAME}/mcp"


def holdings_blob_url() -> str:
    explicit = os.environ.get("HOLDINGS_BLOB_URL")
    if explicit:
        return explicit

    account_url = os.environ.get("AZURE_STORAGE_ACCOUNT_URL")
    container = os.environ.get("AZURE_STORAGE_CONTAINER_NAME")
    if account_url and container:
        return f"{account_url.rstrip('/')}/{container}/holdings.csv"

    raise SystemExit(
        "Set HOLDINGS_BLOB_URL, or set AZURE_STORAGE_ACCOUNT_URL and "
        "AZURE_STORAGE_CONTAINER_NAME."
    )


def _resource_id_by_name(resource_type: str, name: str) -> str:
    result = run_az(
        [
            "resource",
            "list",
            "--resource-type",
            resource_type,
            "--query",
            f"[?name=='{name}'].id | [0]",
            "-o",
            "tsv",
        ]
    )
    resource_id = result.stdout.strip()
    if result.returncode != 0 or not resource_id:
        raise SystemExit(
            f"Could not resolve {resource_type} '{name}' with Azure CLI. "
            "Set the corresponding ARM resource ID explicitly."
        )
    return resource_id


def project_resource_id() -> str:
    explicit = os.environ.get("PROJECT_RESOURCE_ID")
    if explicit:
        return explicit

    parsed = urlparse(project_endpoint())
    resource_name = parsed.hostname.split(".")[0] if parsed.hostname else ""
    project_name = parsed.path.rstrip("/").split("/")[-1]
    if not resource_name or not project_name:
        raise SystemExit(
            "Could not derive the Foundry project resource from FOUNDRY_PROJECT_ENDPOINT. "
            "Set PROJECT_RESOURCE_ID explicitly."
        )
    return _resource_id_by_name(
        "Microsoft.CognitiveServices/accounts/projects",
        f"{resource_name}/{project_name}",
    )


def storage_resource_id() -> str:
    explicit = os.environ.get("STORAGE_RESOURCE_ID")
    if explicit:
        return explicit

    account_url = os.environ.get("AZURE_STORAGE_ACCOUNT_URL")
    if not account_url:
        raise SystemExit(
            "Set AZURE_STORAGE_ACCOUNT_URL or STORAGE_RESOURCE_ID to resolve the "
            "storage account."
        )
    hostname = urlparse(account_url).hostname or ""
    account_name = hostname.split(".")[0]
    if not account_name:
        raise SystemExit(
            "Could not derive the storage account name from AZURE_STORAGE_ACCOUNT_URL. "
            "Set STORAGE_RESOURCE_ID explicitly."
        )
    return _resource_id_by_name("Microsoft.Storage/storageAccounts", account_name)


def toolbox_connection_id(project_resource_id: str) -> str:
    return f"{project_resource_id.rstrip('/')}/connections/{TOOLBOX_CONNECTION_NAME}"


def load_dotenv_if_available() -> None:
    try:
        import dotenv
    except ImportError:
        return
    repo_root = Path(__file__).resolve().parents[3]
    dotenv.load_dotenv(repo_root / ".env")
