# pip install azure-ai-projects azure-identity

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>"
MODEL = "gpt-4o-mini"

# Authenticate (uses your `az login` session, a managed identity, etc.) and get
# an OpenAI-compatible client for the project.
project_client = AIProjectClient(endpoint=ENDPOINT, credential=DefaultAzureCredential())
openai_client = project_client.get_openai_client()


def chat_stream(prompt: str) -> None:
    stream = openai_client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    for event in stream:
        if event.choices and event.choices[0].delta.content:
            print(event.choices[0].delta.content, end="", flush=True)
    print()


print(f"Chatting with '{MODEL}'. Type 'exit' to quit.\n")
while True:
    user_input = input("You: ").strip()
    if user_input.lower() in {"exit", "quit"}:
        break
    print("Assistant: ", end="")
    chat_stream(user_input)
