# Getting Started: Text Chat with Microsoft Foundry

Microsoft Foundry gives you one project endpoint that fronts your model deployments — GPT-4o, GPT-5, Mistral, Llama, and more — with a consistent, OpenAI-compatible API. In this post we'll build the simplest possible chat client: send a prompt, get a response, done. No frameworks, no orchestration, about 30 lines of real code.

## What you need

1. A **Foundry project** with at least one model deployment (e.g. `gpt-4o-mini`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role on the project — or any identity `DefaultAzureCredential` can pick up (managed identity, environment variables, VS Code, etc.). No API keys to manage or leak.
3. Two Python packages:

```bash
pip install azure-ai-projects azure-identity
```

## The core idea

Talking to a Foundry model deployment boils down to three steps:

1. **Authenticate** — get a credential Foundry trusts.
2. **Get an OpenAI-compatible client** — Foundry's SDK hands you a client that speaks the standard OpenAI `chat.completions` API.
3. **Call `chat.completions.create`** — same shape you'd use against OpenAI directly, just pointed at your deployment.

```python
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

with AIProjectClient(
    endpoint="https://<resource-name>.services.ai.azure.com/api/projects/<project-name>",
    credential=DefaultAzureCredential(),
) as project_client:
    with project_client.get_openai_client() as openai_client:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Explain Microsoft Foundry in two sentences."}],
        )
        print(response.choices[0].message.content)
```

That's genuinely it. `DefaultAzureCredential` walks through several sign-in methods automatically, so the exact same code runs on your laptop (via `az login`) and in production (via a managed identity) — no secrets, no API keys stored anywhere.

## Streaming responses

Chat UIs feel much better when tokens appear as they're generated instead of waiting for the full answer. Add `stream=True` and iterate over the response:

```python
stream = openai_client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": prompt}],
    stream=True,
)
for event in stream:
    if event.choices and event.choices[0].delta.content:
        print(event.choices[0].delta.content, end="", flush=True)
```

Each `event` is a chunk of the response; `delta.content` is the next slice of text. Print as you go and you've got a live-typing effect with no extra libraries.

## The full script

The attached [`text_chat.py`](Code/text_chat.py) wraps this into a small interactive chat loop: set your endpoint and model at the top of the file, then run it and start typing.

```bash
python Code/text_chat.py
```

```
Chatting with 'gpt-4o-mini'. Type 'exit' to quit.

You: What is Microsoft Foundry?
Assistant: Microsoft Foundry is ...
You: exit
```

## What we intentionally left out

The production Text Chat use case in this repo adds a lot on top of these fundamentals: model routing across multiple providers, guardrail policy headers, conversation persistence, streaming trace/telemetry payloads, and a pluggable marketplace architecture so this use case behaves consistently alongside dozens of others. None of that changes the fundamentals shown above — it's all built around the same `chat.completions.create` call. Once you're comfortable with this minimal version, layering in history (just add more `messages`), system prompts (`{"role": "system", ...}`), or reasoning effort for reasoning models is a small, incremental step from here.

## Try it yourself

Open `Code/text_chat.py`, set `ENDPOINT` and `MODEL` to your own Foundry project and deployment, and run it — you have a working streaming chat client in under a minute.
