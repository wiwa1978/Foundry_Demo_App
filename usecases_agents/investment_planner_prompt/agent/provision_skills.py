#!/usr/bin/env python3
"""Publish the Investment Planner skills, toolbox, and toolbox connection.

Run this once, and again after editing any skill, before `provision_agent.py create`.
It owns the whole tool surface - you do not pre-create a toolbox or a connection.

  1. Publish skills   multipart POST {project}/skills/{name}/versions?api-version=v1
                      Each part's filename is its path relative to the skill folder, which is
                      how the API reconstructs `scripts/read_blob.py`.
  2. Create / attach  POST {project}/toolboxes/{toolbox}/versions?api-version=v1 with a
                      `skills:[{type:"skill_reference", name}]` list, which creates the toolbox
                      when it does not exist, then PATCH it to make that version the default.
  3. Connection       ARM PUT {PROJECT_RESOURCE_ID}/connections/{connection} with category
                      `RemoteTool` and authType `AgenticIdentityToken`, targeting the toolbox
                      MCP endpoint. No key or SAS is stored: the running agent's own identity
                      token authorizes the MCP call.

Environment (repo root `.env` is loaded automatically when python-dotenv is installed):
  FOUNDRY_PROJECT_ENDPOINT   https://<resource>.services.ai.azure.com/api/projects/<project>
  PROJECT_RESOURCE_ID        ARM id of the Foundry project

Your `az login` identity needs `Azure AI User` on the project.

Adapted from the Microsoft Foundry sample `prompt-agents/agent-identity-and-skills`.
"""

import json
import mimetypes
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from agent_config import (
    SKILLS_DIR,
    TOOLBOX_CONNECTION_NAME,
    TOOLBOX_NAME,
    load_dotenv_if_available,
    project_endpoint,
    project_resource_id,
    run_az,
    toolbox_connection_id,
    toolbox_mcp_url,
)
from azure.identity import DefaultAzureCredential

API_VERSION = "v1"
TOKEN_SCOPE = "https://ai.azure.com/.default"
SKILLS_FEATURE_HEADER = {"Foundry-Features": "Skills=V1Preview"}
ARM_CONNECTION_API_VERSION = "2025-10-01-preview"


def fail(message: str, code: int = 1):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(code)


def request(method, url, token, data=None, headers=None, allow_404=False):
    all_headers = {"Authorization": f"Bearer {token}", **SKILLS_FEATURE_HEADER}
    if headers:
        all_headers.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=all_headers)
    for attempt in range(12):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                body = response.read().decode() or "{}"
                return json.loads(body) if body.strip().startswith(("{", "[")) else body
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            if allow_404 and error.code == 404:
                return None
            if error.code == 409 and "state 'Creating'" in detail and attempt < 11:
                wait_seconds = min(5 * (attempt + 1), 30)
                print(
                    f"  Foundry is still creating this Skill; retrying in "
                    f"{wait_seconds}s ({attempt + 1}/11) ..."
                )
                time.sleep(wait_seconds)
                continue
            fail(f"HTTP {error.code} {method} {url}\n{detail}")


def multipart_from_folder(folder: Path):
    """Build a multipart body containing every file under `folder`."""
    boundary = f"----skill{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        relative = path.relative_to(folder).as_posix()
        content_type = mimetypes.guess_type(relative)[0] or "application/octet-stream"
        parts += [
            f"--{boundary}".encode(),
            crlf,
            f'Content-Disposition: form-data; name="files"; filename="{relative}"'.encode(),
            crlf,
            f"Content-Type: {content_type}".encode(),
            crlf,
            crlf,
            path.read_bytes(),
            crlf,
        ]
    parts += [f"--{boundary}--".encode(), crlf]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def publish_skill(endpoint: str, token: str, folder: Path) -> str:
    existing = request(
        "GET",
        f"{endpoint}/skills/{folder.name}?api-version={API_VERSION}",
        token,
        allow_404=True,
    )
    if isinstance(existing, dict) and existing.get("latest_version"):
        print(
            f"  reusing existing skill '{folder.name}' "
            f"(version {existing['latest_version']})"
        )
        return folder.name

    body, content_type = multipart_from_folder(folder)
    url = f"{endpoint}/skills/{folder.name}/versions?api-version={API_VERSION}"
    result = request("POST", url, token, data=body, headers={"Content-Type": content_type})
    version = result.get("version") if isinstance(result, dict) else "?"
    print(f"  published skill '{folder.name}' (version {version})")
    return folder.name


def attach_to_toolbox(endpoint: str, token: str, skill_names: list[str]) -> None:
    existing = request(
        "GET",
        f"{endpoint}/toolboxes/{TOOLBOX_NAME}?api-version={API_VERSION}",
        token,
        allow_404=True,
    )
    tools = (existing or {}).get("tools", []) if isinstance(existing, dict) else []
    payload = {
        "tools": tools,
        "skills": [{"type": "skill_reference", "name": name} for name in skill_names],
    }
    created = request(
        "POST",
        f"{endpoint}/toolboxes/{TOOLBOX_NAME}/versions?api-version={API_VERSION}",
        token,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    version = created.get("version") if isinstance(created, dict) else None
    if version is None:
        fail(f"toolbox version create returned no version: {created}")
    request(
        "PATCH",
        f"{endpoint}/toolboxes/{TOOLBOX_NAME}?api-version={API_VERSION}",
        token,
        data=json.dumps({"default_version": version}).encode(),
        headers={"Content-Type": "application/json"},
    )
    verb = "created toolbox and attached" if existing is None else "attached"
    print(
        f"  {verb} {len(skill_names)} skill(s) to toolbox '{TOOLBOX_NAME}' "
        f"(version {version}, now default)"
    )


def create_connection(project_resource_id: str, target: str) -> str:
    connection_id = toolbox_connection_id(project_resource_id)
    body = {
        "properties": {
            "authType": "AgenticIdentityToken",
            "category": "RemoteTool",
            "target": target,
            "isSharedToAll": False,
        }
    }
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(body, handle)
        body_path = handle.name
    try:
        result = run_az(
            [
                "rest",
                "--method",
                "PUT",
                "--url",
                f"https://management.azure.com{connection_id}"
                f"?api-version={ARM_CONNECTION_API_VERSION}",
                "--headers",
                "Content-Type=application/json",
                "--body",
                f"@{body_path}",
            ]
        )
    finally:
        os.unlink(body_path)
    if result.returncode != 0:
        fail(f"connection PUT failed:\n{result.stderr or result.stdout}")
    print(f"  connection '{TOOLBOX_CONNECTION_NAME}' -> {target}")
    return connection_id


def main() -> None:
    load_dotenv_if_available()
    endpoint = project_endpoint()
    project_resource_id_value = project_resource_id()

    folders = sorted(
        path
        for path in SKILLS_DIR.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    )
    if not folders:
        fail(f"no skills with a SKILL.md found under {SKILLS_DIR}")

    token = DefaultAzureCredential().get_token(TOKEN_SCOPE).token

    print(f"Publishing {len(folders)} skill(s) to {endpoint} ...")
    names = [publish_skill(endpoint, token, folder) for folder in folders]

    print(f"Attaching to toolbox '{TOOLBOX_NAME}' ...")
    attach_to_toolbox(endpoint, token, names)

    print("Creating the toolbox connection (AgenticIdentityToken) ...")
    connection_id = create_connection(project_resource_id_value, toolbox_mcp_url(endpoint))

    print(f"Done. The agent reaches the toolbox through:\n  {connection_id}")


if __name__ == "__main__":
    main()
