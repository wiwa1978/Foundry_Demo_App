#!/usr/bin/env python3
"""Create, grant, and delete the Investment Planner prompt agent.

A prompt agent is *configuration*: a model, an instructions string, and a tool list. There is
no container and no application code - Foundry runs the reasoning loop for you. Contrast this
with the hosted-agent twin, where the same scenario is expressed as deployed Python.

Order matters. The agent identity (its own Entra service principal) does not exist until the
agent is created, so its role assignments must happen after `create`:

    python provision_agent.py create   # create the agent version, print its principal id
    python provision_agent.py grant    # print (or --apply) the role assignments
    python provision_agent.py delete   # remove every version of the agent

Run `provision_skills.py` first so the toolbox and its connection exist.

Environment (repo root `.env` is loaded automatically when python-dotenv is installed):
  FOUNDRY_PROJECT_ENDPOINT              project endpoint
  FOUNDRY_INVESTMENT_PLANNER_MODEL      model deployment name (falls back to FOUNDRY_MODELS[0])
  HOLDINGS_BLOB_URL                     https://<account>.blob.core.windows.net/<c>/holdings.csv
  STORAGE_RESOURCE_ID                   ARM id of the storage account (for the grant step)
  PROJECT_RESOURCE_ID                   ARM id of the Foundry project (for the grant step)
"""

import argparse
import os
import sys

from agent_config import (
    AGENT_NAME,
    ROLE_FOUNDRY_USER,
    ROLE_STORAGE_BLOB_DATA_READER,
    TOOLBOX_CONNECTION_NAME,
    holdings_blob_url,
    load_dotenv_if_available,
    project_endpoint,
    project_resource_id,
    run_az,
    storage_resource_id,
    toolbox_mcp_url,
)
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import CodeInterpreterTool, MCPTool, PromptAgentDefinition
from azure.identity import DefaultAzureCredential


def build_instructions(blob_url: str) -> str:
    return f"""\
You are an investment-planning assistant. Produce a 6-month allocation plan for the user's
portfolio. Follow this procedure and use the attached skills - never invent data:

1. Use the `blob-reader` skill to download the holdings CSV from the user's Azure Blob Storage
   at `{blob_url}` using your own managed identity. Never ask the user for an account key or a
   SAS token, and never print a credential or token.
2. Parse the CSV in the code interpreter. Its columns are ticker, name, sector, qty,
   avg_cost_usd, current_price_usd, dividend_yield_pct, beta, analyst_rating. Compute each
   position's current value and its weight in the portfolio.
3. Consult the `allocation-policy` skill and follow its target weights, concentration limits,
   rebalancing rules, and required output format. Assume a `moderate` risk tolerance and
   25,000 USD of investable cash unless the user states otherwise.
4. Return the plan as markdown in the chat response. Do not reference file paths in the
   sandbox; the user cannot open them.
"""


def build_client() -> tuple[str, AIProjectClient]:
    endpoint = project_endpoint()
    return endpoint, AIProjectClient(
        endpoint=endpoint,
        credential=DefaultAzureCredential(),
        allow_preview=True,
    )


def resolve_model() -> str:
    model = os.environ.get("FOUNDRY_INVESTMENT_PLANNER_MODEL") or os.environ.get(
        "AZURE_AI_MODEL_DEPLOYMENT_NAME"
    )
    if model:
        return model
    models = [item.strip() for item in os.environ.get("FOUNDRY_MODELS", "").split(",")]
    model = next((item for item in models if item), None)
    if not model:
        raise SystemExit(
            "Set FOUNDRY_INVESTMENT_PLANNER_MODEL to the model deployment the agent should use."
        )
    return model


def agent_principal_id(endpoint: str) -> str | None:
    """Read the agent identity's Entra object id. Only exists after the agent is created."""
    result = run_az(
        [
            "rest",
            "--method",
            "GET",
            "--url",
            f"{endpoint}/agents/{AGENT_NAME}?api-version=v1",
            "--resource",
            "https://ai.azure.com",
            "--query",
            "instance_identity.principal_id",
            "-o",
            "tsv",
        ]
    )
    principal_id = result.stdout.strip()
    if result.returncode != 0 or not principal_id:
        print(
            "WARNING: could not read instance_identity.principal_id "
            f"(az rest said: {result.stderr.strip()}).",
            file=sys.stderr,
        )
        return None
    return principal_id


def command_create(_args) -> None:
    endpoint, client = build_client()
    definition = PromptAgentDefinition(
        model=resolve_model(),
        instructions=build_instructions(holdings_blob_url()),
        temperature=0,
        tools=[
            CodeInterpreterTool(),
            MCPTool(
                server_url=f"{toolbox_mcp_url(endpoint)}?api-version=v1",
                server_label="toolbox",
                require_approval="never",
                project_connection_id=TOOLBOX_CONNECTION_NAME,
            ),
        ],
    )
    # The managed harness runs skills server-side under the agent identity.
    definition["harness"] = "ghcp"

    with client:
        agent = client.agents.create_version(agent_name=AGENT_NAME, definition=definition)
        print(f"Agent created (id={agent.id}, name={agent.name}, version={agent.version})")

    principal_id = agent_principal_id(endpoint)
    if principal_id:
        print(f"Agent identity (principal id): {principal_id}")
        print("Next: run `python provision_agent.py grant` to assign its Blob role.")


def command_grant(args) -> None:
    endpoint, _ = build_client()
    principal_id = agent_principal_id(endpoint)
    if not principal_id:
        raise SystemExit("Create the agent first (`python provision_agent.py create`).")

    storage_scope = storage_resource_id()
    project_scope = project_resource_id()
    grants = [
        (ROLE_STORAGE_BLOB_DATA_READER, "Storage Blob Data Reader", storage_scope),
        (ROLE_FOUNDRY_USER, "Foundry User", project_scope),
    ]

    for role_id, role_name, scope in grants:
        az_args = [
            "role",
            "assignment",
            "create",
            "--assignee-object-id",
            principal_id,
            "--assignee-principal-type",
            "ServicePrincipal",
            "--role",
            role_id or role_name,
            "--scope",
            scope,
        ]
        if args.apply and "<" not in scope:
            print(f"Assigning '{role_name}' to {principal_id} on {scope} ...")
            result = run_az(az_args)
            print(result.stdout or result.stderr)
        else:
            print(f"# {role_name}\naz " + " ".join(az_args) + "\n")

    if not args.apply:
        print(
            "Set STORAGE_RESOURCE_ID and PROJECT_RESOURCE_ID then re-run with --apply, or paste "
            "the commands above. Allow 1-5 minutes for RBAC to propagate."
        )


def command_delete(_args) -> None:
    _, client = build_client()
    with client:
        versions = list(client.agents.list_versions(agent_name=AGENT_NAME))
        for version in versions:
            client.agents.delete_version(agent_name=AGENT_NAME, agent_version=version.version)
    print(f"Deleted {len(versions)} version(s) of '{AGENT_NAME}'.")


def main() -> None:
    load_dotenv_if_available()
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("create").set_defaults(func=command_create)
    grant = subcommands.add_parser("grant")
    grant.add_argument(
        "--apply",
        action="store_true",
        help="run the role assignments instead of printing them",
    )
    grant.set_defaults(func=command_grant)
    subcommands.add_parser("delete").set_defaults(func=command_delete)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
