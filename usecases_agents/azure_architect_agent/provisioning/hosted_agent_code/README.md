# Hosted agent with code

This folder contains the source-code hosted agent and the deployment script
that publishes it to Foundry Agent Service.

- `agent/main.py` is the hosted runtime entry point. It runs
  `ResponsesHostServer` and loads `agent/skills/*/SKILL.md` at startup,
  appending each skill's instructions to the agent's system prompt (see
  `..\skills\README.md`).
- `agent/skills/azure-architecture-review/SKILL.md` is the bundled copy of the
  azure-architecture-review Foundry Skill. Refresh it with
  `..\skills\download_skill.py` after publishing a new version.
- `agent/requirements.txt` is packaged with the runtime for remote dependency
  resolution.
- `deploy.py` builds the zip (main.py, requirements.txt, and skills/), uploads
  a new agent version, waits for activation, and sends a smoke-test request.

## Run

From this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r agent\requirements.txt
pip install -r requirements.txt
Copy-Item ..\.env .env
python deploy.py
```

The generated deployment zip is written beside `deploy.py`.
