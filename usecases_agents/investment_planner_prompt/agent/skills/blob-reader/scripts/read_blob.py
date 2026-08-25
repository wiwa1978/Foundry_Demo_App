#!/usr/bin/env python3
"""Download a blob from Azure Blob Storage using the caller's managed identity.

Standard library only, so this runs on a bare Python sandbox with no package installs.
Authenticates to Storage with a Microsoft Entra bearer token - no account key, no SAS. Inside
the Foundry managed harness the *agent's* identity is what DefaultAzureCredential resolves to,
and that identity needs Storage Blob Data Reader on the container or account.

Token resolution order (first that works wins):
  1. --token, or the STORAGE_TOKEN / AZURE_STORAGE_TOKEN environment variable
  2. azure-identity DefaultAzureCredential
  3. az account get-access-token

Blob URL: --url, or the HOLDINGS_BLOB_URL / BLOB_URL environment variable.
"""

import argparse
import os
import subprocess
import sys
import urllib.error
import urllib.request

STORAGE_SCOPE = "https://storage.azure.com/.default"
X_MS_VERSION = "2021-08-06"


def fail(message, code=1):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(code)


def resolve_token(explicit=None):
    token = (
        explicit
        or os.environ.get("STORAGE_TOKEN")
        or os.environ.get("AZURE_STORAGE_TOKEN")
    )
    if token:
        return token.strip()
    try:
        from azure.identity import DefaultAzureCredential

        return DefaultAzureCredential().get_token(STORAGE_SCOPE).token
    except Exception:
        pass
    try:
        output = subprocess.check_output(
            [
                "az",
                "account",
                "get-access-token",
                "--scope",
                STORAGE_SCOPE,
                "--query",
                "accessToken",
                "-o",
                "tsv",
            ],
            stderr=subprocess.DEVNULL,
            shell=(os.name == "nt"),
        )
        return output.decode().strip()
    except Exception:
        fail(
            "could not obtain a Storage token. Pass --token, set STORAGE_TOKEN, "
            "install azure-identity, or run 'az login'."
        )


def resolve_url(explicit=None):
    url = explicit or os.environ.get("HOLDINGS_BLOB_URL") or os.environ.get("BLOB_URL")
    if not url:
        fail(
            "no blob URL. Pass --url or set HOLDINGS_BLOB_URL "
            "(https://<account>.blob.core.windows.net/<container>/<blob>)."
        )
    return url


def download(url, token):
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {token}", "x-ms-version": X_MS_VERSION},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        if error.code in (401, 403):
            fail(
                f"HTTP {error.code}: the identity lacks 'Storage Blob Data Reader' on this "
                f"container or account. Grant the role and retry.\n{detail}"
            )
        if error.code == 404:
            fail(f"HTTP 404: blob not found. Check the URL.\n{detail}")
        fail(f"HTTP {error.code} GET {url}\n{detail}")


def main():
    parser = argparse.ArgumentParser(
        description="Download an Azure blob using the caller's Entra identity."
    )
    parser.add_argument("--url", help="full blob URL (or env HOLDINGS_BLOB_URL)")
    parser.add_argument("--token", help="bearer token (or env STORAGE_TOKEN)")
    parser.add_argument("--out", help="output path (default: stream to stdout)")
    args = parser.parse_args()

    data = download(resolve_url(args.url), resolve_token(args.token))

    if args.out:
        with open(args.out, "wb") as handle:
            handle.write(data)
        print(f"wrote {len(data)} bytes to {args.out}")
    else:
        sys.stdout.buffer.write(data)


if __name__ == "__main__":
    main()
