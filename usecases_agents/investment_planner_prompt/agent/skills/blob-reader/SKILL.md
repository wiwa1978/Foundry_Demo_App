---
name: blob-reader
description: Download a blob (CSV, JSON, or any file) from Azure Blob Storage using the caller's own managed identity via Microsoft Entra ID - no account key and no SAS token. Use when an agent must read input data a user placed in their own blob container, including from inside the managed harness sandbox where DefaultAzureCredential resolves to the agent identity. Requires the identity to hold the 'Storage Blob Data Reader' role on the container or account.
---

# Blob Reader

## Overview

Downloads a blob from Azure Blob Storage authenticated with a Microsoft Entra bearer token
belonging to **the caller** - which, inside the Foundry managed harness, is the *agent's own
identity*, not the end user and not the application. The bundled `scripts/read_blob.py` is
standard-library only so it runs on a bare Python sandbox with no package installs.

## Prerequisites

- **`HOLDINGS_BLOB_URL`** (or `--url`) - the full blob URL,
  `https://<account>.blob.core.windows.net/<container>/<blob>`.
- **A token** - resolved automatically in this order: `--token`, the `STORAGE_TOKEN`
  environment variable, `DefaultAzureCredential`, then `az account get-access-token`. The
  scope is `https://storage.azure.com/.default`.
- **RBAC** - the identity needs **Storage Blob Data Reader** on the container or account
  (role id `2a2b9908-6ea1-4ae2-8e65-a410df84e7d1`).

## Usage

```bash
export HOLDINGS_BLOB_URL="https://<account>.blob.core.windows.net/<container>/holdings.csv"

python scripts/read_blob.py --out ./holdings.csv   # omit --out to stream to stdout
```

## Key rules

- **401 or 403 means the role is missing**, not a transient fault. Report it plainly and stop
  rather than retrying.
- **404 means the URL is wrong** (container or blob path). The URL is a plain blob path, not a
  SAS URL.
- This skill reads only. It never writes or deletes, and it never prints the bearer token.
