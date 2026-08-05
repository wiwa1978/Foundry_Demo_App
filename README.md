# Foundry Chat App

A lightweight local app for chatting with and comparing Microsoft Foundry model deployments. The backend is FastAPI using the Microsoft Foundry SDK with Microsoft Entra ID, and the frontend is React, Tailwind CSS, and shadcn-style local components.

## Features

- Switch between Foundry deployments with a ChatGPT-style active model selector.
- Switch the active deployment and per-prompt reasoning effort directly from the chat composer.
- Open a use-case marketplace to tune the UI for text chat, document Q&A, model comparison, browser voice, traditional voice, or realtime voice.
- Toggle between light and dark themes.
- Chat with one active deployment by default, with streamed token-by-token output.
- Enable side-by-side comparison with synced prompt inputs for several deployments.
- Upload documents for RAG-style question answering with Foundry embeddings, Azure AI Search retrieval, and Foundry chat responses.
- Deploy the demo to Azure Container Apps with the included Bicep infrastructure under `infra\`.
- Sign in with a Microsoft account in Azure Container Apps deployments that enable Microsoft Entra authentication.
- Save system prompts, generation parameters, API surface, and model capability tags separately for each deployment.
- Persist chat conversations locally, send prior turns as context, and delete saved chats from the sidebar context menu.
- Dictate prompts with browser speech-to-text.
- Toggle spoken readback for assistant responses while text is displayed.
- Track latency, response text, and token usage when the service returns it.
- View model metrics for local request volume, token usage, estimated cost, and latency.
- Add ad-hoc deployment names directly in the browser and persist them locally.
- Create Foundry model deployments from the Admin UI when Azure resource metadata is configured.
- Demo Foundry voice two ways: a traditional STT -> chat -> TTS pipeline and Realtime WebRTC speech-in/speech-out.

## Setup

1. Create and activate a Python virtual environment.

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install dependencies.

   ```powershell
   pip install -r requirements.txt
   ```

3. Install frontend dependencies.

   ```powershell
   Set-Location frontend
   npm install
   Set-Location ..
   ```

4. Sign in to Azure so `DefaultAzureCredential` can access Foundry.

   ```powershell
   az login
   ```

   Your signed-in user needs access to the Foundry project, such as the **Foundry User** role.

5. Copy `.env.example` to `.env` and set your Foundry project endpoint. Local development uses SQLite by default, so Cosmos DB settings can be left unset. `FOUNDRY_MODELS` is optional and only seeds the model registry on startup.

   ```powershell
   Copy-Item .env.example .env
   ```

   `FOUNDRY_PROJECT_ENDPOINT` should point to the project endpoint from your Foundry Project home page, for example:

   ```text
   https://<your-foundry-resource>.services.ai.azure.com/api/projects/<your-project-name>
   ```

6. Run the backend.

   ```powershell
   uvicorn app.main:app --reload
   ```

7. In another terminal, run the React frontend.

   ```powershell
   Set-Location frontend
   npm run dev
   ```

8. Open http://127.0.0.1:5173.

## Production-style local run

Build the frontend and let FastAPI serve it:

```powershell
Set-Location frontend
npm run build
Set-Location ..
uvicorn app.main:app --reload
```

Then open http://127.0.0.1:8000.

### Local Microsoft sign-in

Local sign-in uses a confidential Microsoft Entra web app because Azure Container Apps' `/.auth`
endpoints do not exist on a developer machine.

1. Create or select an app registration in Microsoft Entra ID.
2. Under **Authentication**, add the Web redirect URI `http://localhost:5173/api/auth/callback`.
3. Under **Certificates & secrets**, create a client secret and copy its value.
4. Add the five `ENTRA_LOCAL_*` values shown in `.env.example` to `.env`.
5. Run FastAPI on port 8000 and Vite on port 5173, then open `http://localhost:5173`.

Use `localhost` consistently rather than mixing it with `127.0.0.1`, because the temporary sign-in
cookie is scoped to the browser host. The local session is stored in an HTTP-only signed cookie and
expires after eight hours.

## Configuration

| Variable | Description |
| --- | --- |
| `PERSISTENCE_BACKEND` | Persistence provider: `sqlite` (default, recommended locally) or `cosmos` (used by Azure deployments). |
| `SQLITE_DATABASE_PATH` | Optional SQLite file path. Defaults to `data/foundry_chat.sqlite3`. |
| `FOUNDRY_PROJECT_ENDPOINT` | Microsoft Foundry project endpoint, usually `https://<resource>.services.ai.azure.com/api/projects/<project-name>`. The app derives the OpenAI-compatible `/openai/v1` model endpoint from this value for inference. `AZURE_AI_PROJECT_ENDPOINT` and `AZURE_AIPROJECT_ENDPOINT` are also accepted. |
| `FOUNDRY_OPENAI_ENDPOINT` | Optional compatibility fallback if you want to provide the direct endpoint explicitly, usually `https://<resource>.services.ai.azure.com/openai/v1`. `AZURE_OPENAI_ENDPOINT` is also accepted. |
| `FOUNDRY_MODELS` | Optional comma-separated deployment names used to seed the configured model registry. New deployments and local endpoints are stored in the database, so this does not need to be updated after setup. |
| `AZURE_COSMOS_ENDPOINT` | Required when `PERSISTENCE_BACKEND=cosmos`. Cosmos DB for NoSQL account endpoint. The app authenticates with `DefaultAzureCredential` unless `AZURE_COSMOS_KEY` is set. |
| `AZURE_COSMOS_DATABASE_NAME` | Required when using Cosmos. Shared Cosmos DB database name. |
| `AZURE_COSMOS_CONTAINER_NAME` | App-specific container name. Defaults to `foundry-chat-app`; use a different container for each app sharing the database. The container partition key must be `/partition_key`. |
| `AZURE_COSMOS_CREATE_CONTAINER` | Optional. Set to `true` only when the current identity/key may create containers. Normally infrastructure provisions the container. |
| `AZURE_COSMOS_KEY` | Optional account key for local development or the Cosmos emulator. Omit in Azure and use managed identity. |
| `AZURE_STORAGE_ACCOUNT_URL` | Optional Blob Storage account URL for original **Document Q&A** uploads, such as `https://<account>.blob.core.windows.net`. `FOUNDRY_STORAGE_ACCOUNT_URL` is also accepted. |
| `AZURE_STORAGE_CONTAINER_NAME` | Optional Blob container for original document files. Defaults to `foundry-rag-documents`. `FOUNDRY_STORAGE_CONTAINER_NAME` is also accepted. |
| `AZURE_SEARCH_ENDPOINT` | Optional Azure AI Search endpoint for the **Document Q&A** use case, such as `https://<service>.search.windows.net`. `FOUNDRY_SEARCH_ENDPOINT` is also accepted. |
| `AZURE_SEARCH_INDEX_NAME` | Optional Azure AI Search index name for document chunks. Defaults to `foundry-document-rag`. `FOUNDRY_SEARCH_INDEX_NAME` is also accepted. |
| `FOUNDRY_EMBEDDING_MODEL` | Optional Foundry embedding deployment used to vectorize uploaded chunks and questions. Defaults to `text-embedding-3-small`. |
| `FOUNDRY_EMBEDDING_DIMENSIONS` | Optional embedding dimension override when reusing a pre-created index. When omitted, the app uses the dimensions returned by Foundry when the first document is uploaded. |
| `FOUNDRY_REALTIME_ENDPOINT` | Optional OpenAI-compatible endpoint for the Realtime voice demo, usually `https://<resource>.services.ai.azure.com/openai/v1`. Defaults to `FOUNDRY_PROJECT_ENDPOINT` when omitted by deriving `/openai/v1` from the project endpoint. `AZURE_OPENAI_ENDPOINT` is also accepted. |
| `FOUNDRY_REALTIME_MODEL` | Optional realtime deployment name used by the voice demo. Defaults to a realtime model in `FOUNDRY_MODELS`, or `gpt-realtime-2.1`. |
| `FOUNDRY_TRANSCRIPTION_MODEL` | Optional OpenAI-compatible transcription deployment for the traditional voice pipeline. Defaults to `gpt-4o-mini-transcribe`. |
| `FOUNDRY_TTS_MODEL` | Optional text-to-speech deployment for the traditional voice pipeline. Defaults to `gpt-4o-mini-tts`. |
| `FOUNDRY_TTS_VOICE` | Optional TTS voice name for the traditional voice pipeline. Defaults to `alloy`. |
| `AZURE_SPEECH_ENDPOINT` | Azure AI Speech custom-domain endpoint for Recorded Audio Transcription with the configured MAI model, and for Live translation. |
| `AZURE_SPEECH_KEY` | Optional Azure AI Speech resource key fallback. By default the app uses Microsoft Entra ID through Azure CLI locally and managed identity in Azure. |
| `AZURE_SPEECH_TRANSCRIPTION_MODEL` | Deployment name routed through Azure Speech for Recorded Audio Transcription. Defaults to `MAI-Transcribe-1.5`. |
| `AZURE_VOICELIVE_ENDPOINT` | Optional Foundry or Speech resource root endpoint for the Voice Live travel concierge. Defaults to `AZURE_SPEECH_ENDPOINT`. |
| `AZURE_VOICELIVE_MODEL` | Managed Voice Live model name. Defaults to `gpt-realtime`. |
| `AZURE_VOICELIVE_VOICE` | Azure Speech voice used by Voice Live. Defaults to `en-US-Ava:DragonHDLatestNeural`. |
| `ENTRA_AUTH_ENABLED` | Optional flag used by the deployed backend. Set to `true` with Azure Container Apps authentication to require a signed-in Microsoft Entra user for protected `/api/*` routes. |
| `ENTRA_LOCAL_CLIENT_ID` | Client ID of a confidential Microsoft Entra web app used for local sign-in. Do not use the workload identity client ID. |
| `ENTRA_LOCAL_CLIENT_SECRET` | Client secret value for the local web app registration. Keep it only in `.env`. |
| `ENTRA_LOCAL_TENANT_ID` | Microsoft Entra tenant ID for local sign-in. |
| `ENTRA_LOCAL_REDIRECT_URI` | Exact registered web redirect URI, normally `http://localhost:5173/api/auth/callback` when using Vite. |
| `ENTRA_LOCAL_SESSION_SECRET` | Random value of at least 32 characters used to sign local HTTP-only session cookies. |
| `FOUNDRY_INPUT_TOKEN_COST_PER_1K` | Optional input-token price per 1K tokens used by the Model metrics dashboard to estimate cost. Defaults to `0`. |
| `FOUNDRY_OUTPUT_TOKEN_COST_PER_1K` | Optional output-token price per 1K tokens used by the Model metrics dashboard to estimate cost. Defaults to `0`. |
| `FOUNDRY_SUBSCRIPTION_ID` | Optional Azure subscription ID used for automatic deployment discovery and the Admin deployment UI. `AZURE_SUBSCRIPTION_ID` is also accepted. |
| `FOUNDRY_RESOURCE_GROUP` | Optional resource group for automatic deployment discovery and the Admin deployment UI. `AZURE_RESOURCE_GROUP` is also accepted. |
| `FOUNDRY_ACCOUNT_NAME` | Optional Foundry/Azure AI resource name used for automatic deployment discovery and the Admin deployment UI. `AZURE_AI_ACCOUNT_NAME` and `AZURE_OPENAI_RESOURCE_NAME` are also accepted. |

Deployment names must match models you deployed in Microsoft Foundry.

When the three management settings above are configured, the app queries Foundry on each site load and merges active deployments into every model dropdown. The app identity needs permission to read deployments on the Foundry resource. Manually registered and `FOUNDRY_MODELS` entries remain available if discovery is unavailable.

The recommended configuration uses `FOUNDRY_PROJECT_ENDPOINT` as the single Foundry endpoint. For model calls, the backend derives the OpenAI-compatible base URL by replacing the project path with `/openai/v1`, then creates an `OpenAI` client with `DefaultAzureCredential()` and uses `responses.create` or `chat.completions.create` for each selected deployment.

That keeps the app aligned with Foundry project configuration while avoiding a second required endpoint variable. `FOUNDRY_OPENAI_ENDPOINT` remains supported only as a compatibility override.

There are two separate choices:

| Choice | Recommended default | Why |
| --- | --- | --- |
| Client endpoint | `FOUNDRY_PROJECT_ENDPOINT`, with `/openai/v1` derived internally | One Foundry project endpoint in configuration, while model calls use the endpoint expected by the OpenAI-compatible SDK. |
| Model API surface | Per-model setting: Responses API or Chat Completions API | Different deployments document different APIs. GPT-5.5 uses Responses; Kimi K2.5 uses Chat Completions. |

## Model switching and comparison

The model selector is loaded from the Cosmos DB model registry. `FOUNDRY_MODELS` only seeds that registry for first-run compatibility; after that, local endpoints and deployments created from the Admin UI are saved to the database and appear after refresh without editing `.env`.

The default mode is single-model chat: choose the active deployment from the selector and send the prompt. Turn on **Side-by-side comparison** when you want one chat pane per selected deployment. Each pane has its own model selector and prompt box, but the prompt text is shared across all panes. Sending from any pane calls `/api/compare`, which dispatches the same prompt to all selected models concurrently.

Single-model chat uses `/api/chat/stream` and server-sent events so the response appears incrementally as the model generates text. Side-by-side comparison still waits for the full response from each selected model so the panes finish independently.

The chat composer includes a model dropdown that stays synchronized with the sidebar active model selector. Its reasoning selector sends the selected Responses API `reasoning.effort` override with the request; leaving it on **Default reasoning** omits the override.

## Use cases

The top bar includes a **Use cases** marketplace. Use cases are local UI presets that focus the app for a scenario without changing the underlying Foundry configuration. The app always opens in **Text Chat** after a refresh or browser restart.

| Use case | What changes |
| --- | --- |
| **Text Chat** | Shows the clean single-model chat workspace and hides voice/comparison sidebar controls. |
| **Document Q&A** | Shows document upload/index controls, stores original files in Blob Storage, stores chunks in Azure AI Search, retrieves relevant chunks with Foundry embeddings, and answers with the selected Foundry chat deployment. |
| **Side by Side comparison** | Opens the comparison workspace and shows model multi-select controls. |
| **Browser based voice** | Keeps the text chat workspace and exposes browser dictation/readback controls. |
| **STT -> Chat -> TTS** | Opens the traditional Foundry voice pipeline workspace. |
| **Recorded Audio Transcription** | Records or uploads completed audio and returns a finalized transcript using `GPT-transcribe`, `GPT-4o-transcribe`, `GPT-4o-mini-transcribe`, or `MAI-Transcribe-1.5`. It is not live streaming or the Azure Speech Fast Transcription REST API. |
| **Live translation** | Streams microphone audio to Azure Speech Live Interpreter, automatically detects changing source languages, and returns Personal Voice audio in one selected target language. |
| **Realtime Speech in / Speech out** | Opens the Foundry Realtime WebRTC workspace. |

Settings, API trace, metrics, previous conversations, and model settings remain available outside the marketplace because they are shared app capabilities.

## Microsoft Entra sign-in

For Azure Container Apps deployments, the infrastructure can enable built-in Microsoft Entra authentication while leaving static frontend routes anonymous. The app then shows a **Sign in with Microsoft** button in the header, uses `/.auth/login/aad?post_login_redirect_uri=...` to force Microsoft account selection, and protects backend API routes until Container Apps supplies the signed-in user headers.

See `infra\README.md` for the Entra app registration helper and GitHub variable/secret setup.

## Document Q&A RAG

The **Document Q&A** use case uses Blob Storage for originals, Azure AI Search for retrieval, and Foundry for model calls:

1. Uploaded PDF, DOCX, TXT, Markdown, CSV, JSON, HTML, XML, or log files are stored in the configured Blob container under `documents/<document-id>/<filename>`.
2. The backend reads the uploaded file, extracts text, and splits it into chunks.
3. The backend calls the configured Foundry embedding deployment and uploads chunk text, vectors, and the Blob URL/path to Azure AI Search.
4. Each question is embedded with the same Foundry deployment and sent to Azure AI Search as a hybrid keyword/vector query.
5. Retrieved excerpts are inserted into a grounded prompt that is answered by the selected Foundry chat deployment with citation instructions.

The signed-in identity needs RBAC access to the Foundry project, Azure AI Search, and Blob Storage. For Search, enable Entra auth with `aadOrApiKey`, grant **Search Index Data Reader** for querying, **Search Index Data Contributor** for indexing, and **Search Service Contributor** if the app should create or update the index automatically. For Storage, grant **Storage Blob Data Contributor** on the storage account or container. For a from-scratch Azure deployment, use the reusable Bicep templates in `infra\`; see `infra\README.md`.

If you only need to patch an existing demo environment, you can still use the helper script:

```powershell
.\scripts\create-storage-private-endpoint.ps1 `
  -SubscriptionId "<subscription-id>" `
  -ResourceGroup "<storage-resource-group>" `
  -StorageAccountName "<storage-account-name>" `
  -VirtualNetworkResourceGroup "<vnet-resource-group>" `
  -VirtualNetworkName "<vnet-name>" `
  -SubnetName "<private-endpoint-subnet-name>" `
  -SearchServiceName "<search-service-name>" `
  -CreateResourceGroupsIfMissing `
  -CreateNetworkIfMissing `
  -CreateStorageAccountIfMissing `
  -CreateSearchServiceIfMissing
```

The script creates resource groups when `-CreateResourceGroupsIfMissing` is set, creates the VNet/subnet when `-CreateNetworkIfMissing` is set, creates the storage account when `-CreateStorageAccountIfMissing` is set, creates Azure AI Search when `-CreateSearchServiceIfMissing` is set, then creates or reuses the Blob private endpoint, `privatelink.blob.core.windows.net` private DNS zone, VNet DNS link, and endpoint DNS zone group. It prints the `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER_NAME`, `AZURE_SEARCH_ENDPOINT`, and `AZURE_SEARCH_INDEX_NAME` values to copy into `.env`. The default new network range is `10.40.0.0/16` with subnet `10.40.1.0/24`; override it with `-VirtualNetworkAddressPrefix` and `-SubnetAddressPrefix` if needed. The caller needs permission to create/read/update the storage account, create private endpoints, update the subnet, create/manage Azure AI Search, and manage private DNS links. Add `-DisableStoragePublicNetworkAccess` only after the app runs from a machine or Azure service with network access to that VNet; otherwise local uploads will fail because the normal storage URL resolves to a private address.

### Adding a use case

Use cases are intentionally modular so the app can be shared as a clean customer demo or starter project:

```text
frontend/src/app/types.ts                 Shared use-case contracts
frontend/src/app/useCaseRegistry.ts       Ordered registry shown in the marketplace
frontend/src/features/useCases/*.ts       One metadata module per use case
frontend/src/features/marketplace/        Marketplace UI
frontend/src/features/shared/             Shared visuals such as SoundWaveIcon
```

To add a new use case, create a module in `frontend/src/features/useCases/` that exports a `UseCaseModule`, then add it to `frontend/src/app/useCaseRegistry.ts`. The app shell consumes the registry for the marketplace and selected use-case labels, while shared backend routes and model settings remain reusable across use cases.

Each `UseCaseModule` owns its marketplace metadata and behavior flags, including the workspace type, whether browser voice controls are shown, whether comparison controls are shown, and whether composer dictation is enabled. This keeps use-case decisions out of the generic app shell.

## Per-model settings

Use the gear icon beside a model to open its settings page. Settings are persisted per deployment endpoint in the app's Cosmos DB container.

Each model endpoint can have its own:

- API surface: Responses API or Chat Completions API
- Model capabilities: text, image, and/or voice
- System prompt
- Temperature
- Top P
- Max tokens
- Repetition penalty

The backend applies the saved settings automatically for both single-model chat and side-by-side comparison.

The Foundry Responses API exposes temperature, top P, and max output tokens as typed parameters. When repetition penalty is changed from `1.0`, the app sends it as the OpenAI-compatible `frequency_penalty` value through `extra_body`, so support depends on the selected deployment.

Some reasoning-style deployments, including GPT-5 and o-series model names, reject sampling controls such as temperature, top P, and frequency penalty. For deployment names starting with `gpt-5`, `gpt5`, `o1`, `o3`, or `o4`, the backend automatically omits those sampling parameters and only sends the supported settings.

Kimi deployment names default to Chat Completions because the Foundry sample for Kimi uses `client.chat.completions.create(...)`. You can override the API surface in the model settings modal.

Each assistant response shows the API surface that was actually used, either **Responses API** or **Chat Completions API**, in the response metadata. That value is also stored with the conversation history.

### Guardrail comparison

Each model can enable a side-by-side guardrail experiment. The custom guardrail dropdown is
retrieved from the configured Foundry account through the Cognitive Services management SDK.
The deployment-default request omits `x-policy-id` and uses the policy assigned to the deployment.
A selected custom policy is sent through `x-policy-id` as a request-level override, so it does not
need to be assigned to that deployment in Foundry. Foundry supports this override for text requests;
image-input requests continue to use the deployment default.

Text chat, Document Q&A, model comparison, and traditional voice display both results and their
guardrail annotations. Realtime voice remains a single WebRTC session and explicitly reports that
request-level comparison is unavailable. The app identity must be able to list RAI policies on the
Foundry account.

Capability tags are local metadata for the playground. They do not change the Foundry deployment, but they let the app later filter models by use case, such as text, image, or voice.

## Conversation history

Chats are stored in the app's Cosmos DB container. The sidebar lists saved conversations, and each new prompt sends prior turns from the current conversation as context.

Right-click a saved conversation in the sidebar to delete it. Deleting removes the conversation and its messages from Cosmos DB.

For side-by-side comparison, the app stores one user message and one assistant response per selected model. When building context for a model, the backend includes the shared user turns and that model's previous assistant responses.

The shared database uses one container per app to isolate data and RBAC. The container is partitioned by `/partition_key`: a conversation and all its messages share the conversation ID, while model settings use a dedicated logical partition.

To migrate the existing local SQLite records after configuring Cosmos DB, run this once:

```powershell
python .\scripts\migrate_sqlite_to_cosmos.py
```

The migration is idempotent and upserts the existing conversations, messages, and model settings into Cosmos DB.

## Deployment admin

The **Admin > Deploy model** UI creates Azure AI Foundry model deployments through the Azure Cognitive Services management API using `DefaultAzureCredential`. It is optional and only enabled when `FOUNDRY_SUBSCRIPTION_ID`, `FOUNDRY_RESOURCE_GROUP`, and `FOUNDRY_ACCOUNT_NAME` are set.

The form mirrors the deployment basics from the Foundry/Azure CLI path: deployment name, base model name, model version, model format, SKU name, SKU capacity, version upgrade option, and optional RAI policy name. After starting a deployment, the app also saves the new deployment in the Cosmos DB model registry with its API surface, capability tags, and default settings.

## Voice demos

The **Use cases** marketplace exposes two Foundry-backed voice patterns:

| Demo path | Flow | What it shows |
| --- | --- | --- |
| Traditional STT -> Chat -> TTS | Browser records audio -> backend calls `/audio/transcriptions` -> transcript is sent to the selected chat deployment such as `gpt-5.5` -> backend calls `/audio/speech` -> browser plays the returned audio. | A composable, inspectable pipeline where each step can use a different Foundry deployment. It naturally has more latency because transcription and speech are request/file based. |
| Realtime speech-in/speech-out | Browser opens WebRTC to Foundry Realtime using a short-lived client secret -> microphone audio streams to the realtime deployment -> the browser plays the model's audio response. | A low-latency native voice interaction with a realtime deployment such as `gpt-realtime-2.1`. |

The traditional pipeline does not use browser speech recognition or OS voices. The browser only records microphone audio and plays the audio returned by Foundry TTS. Configure it with `FOUNDRY_TRANSCRIPTION_MODEL`, `FOUNDRY_TTS_MODEL`, and `FOUNDRY_TTS_VOICE`.

The **Recorded Audio Transcription** use case records or uploads a complete audio file before transcription starts. `GPT-transcribe`, `GPT-4o-transcribe`, and `GPT-4o-mini-transcribe` deployments use the OpenAI-compatible `/audio/transcriptions` API. The deployment configured by `AZURE_SPEECH_TRANSCRIPTION_MODEL`, which defaults to `MAI-Transcribe-1.5`, uses the Azure Speech SDK. Set `AZURE_SPEECH_ENDPOINT` to the resource custom domain, such as `https://<resource>.cognitiveservices.azure.com/`, and grant the caller the **Cognitive Services Speech User** role. Local development uses the signed-in Azure CLI identity; Container Apps uses its managed identity. `AZURE_SPEECH_KEY` remains an optional fallback when API key authentication is enabled. This workflow is neither live streaming nor the dedicated Azure Speech Fast Transcription REST API.

The Live translation use case reuses that Speech resource and derives its `wss://<resource>.cognitiveservices.azure.com/stt/speech/universal/v2` endpoint. The browser streams 16 kHz mono PCM through the backend and receives translated text plus Personal Voice PCM. Before using it, [apply for Personal Voice access](https://aka.ms/customneural), select **Personal Voice** for question 20, and use a [region supported by Live Interpreter](https://learn.microsoft.com/azure/ai-services/speech-service/regions?tabs=speech-translation). Use headphones during a session to avoid microphone feedback. Live Interpreter supports one synthesized target language per session and does not currently return source-language transcription.

The Realtime demo asks the backend for a short-lived Realtime client secret using Microsoft Entra ID, opens a browser WebRTC connection to `/openai/v1/realtime/calls`, streams microphone audio to the `FOUNDRY_REALTIME_MODEL` deployment, and plays the model's audio response. If you only set `FOUNDRY_PROJECT_ENDPOINT`, the app derives the OpenAI-compatible base URL from it. You can also set `FOUNDRY_REALTIME_ENDPOINT` explicitly to the endpoint shown by Foundry, such as `https://<resource>.services.ai.azure.com/openai/v1`.

The Voice Live travel concierge is a separate use case. The backend authenticates to the resource and proxies the Voice Live control WebSocket; browser microphone and response audio flow over WebRTC. Its session adds Azure multilingual semantic turn detection, filler-word filtering, interruption handling, deep noise suppression, server echo cancellation, and an Azure HD voice. Set `AZURE_VOICELIVE_ENDPOINT` to the resource root, such as `https://<resource>.services.ai.azure.com/`, and grant the app identity **Cognitive Services User** and **Foundry User**. Voice Live uses managed models, so `AZURE_VOICELIVE_MODEL` is a model name rather than the deployment used by the Realtime demo.

The **Browser based voice** use case is separate from the Foundry voice demos. It uses browser speech APIs:

- **Browser dictation** starts/stops microphone dictation and appends recognized speech to the prompt input.
- **Browser readback** reads assistant responses aloud as soon as the text response is displayed.

Browser support varies. Chromium-based browsers generally support speech recognition; some browsers may support text-to-speech but not dictation. Available readback voices depend on the browser and OS.

Deployments with names such as `gpt-realtime-2.1` are tagged locally as voice-capable model endpoints.
