# Modularity Improvement Plan

## Current assessment

The repository has good foundations but is only partially modular. The backend has recognizable API, application, domain, and infrastructure layers. The primary risks are centralized frontend orchestration, reversed backend dependencies, and loosely typed internal contracts.

Current central modules:

- `frontend/src/app/AppWorkspace.tsx`: 1,221 lines
- `frontend/src/app/workspace/WorkspaceContentRouter.tsx`: 786 lines
- `app/application/chat.py`: 393 lines
- `app/application/conversations.py`: 373 lines
- `app/application/foundry_admin.py`: 317 lines

## Goals

1. Make features independently maintainable.
2. Keep `AppWorkspace` focused on application-shell concerns.
3. Restore the backend dependency direction: `API/infrastructure -> application -> domain`.
4. Replace loose internal payloads with typed contracts.
5. Preserve all current UI, HTTP, SSE, persistence, and deployment behavior.

## Non-goals

- No UI redesign.
- No API route or JSON-contract changes.
- No SQLite or Cosmos schema changes.
- No new frontend state-management framework.
- No wholesale rewrite.
- No compatibility shims or parallel legacy architecture.

## Phase 1 — Establish architectural boundaries

Define ownership before moving implementation.

### Frontend ownership

#### Application shell

- Authentication and bootstrap
- Active view and use-case selection
- Theme and palette
- API tracing
- Global navigation and modals

#### Feature controllers

- Feature-specific state
- API calls
- Start, cancel, and reset lifecycle
- Feature event handling
- View-model construction

#### Workspace components

- Rendering
- User interaction

### Backend ownership

- `app/domain/`: business entities and value types; no FastAPI, Azure, Cosmos, SQLite, or configuration imports.
- `app/application/`: commands, results, ports, and orchestration; no `app.api` or `app.infrastructure` imports.
- `app/api/`: HTTP validation and mapping.
- `app/infrastructure/`: Azure and persistence adapters.
- `app/main.py`: composition root.

### Acceptance criteria

- Dependencies and ownership have one documented direction.
- Existing API and UI behavior remain authoritative.
- No second architecture is introduced during migration.

## Phase 2 — Extract frontend feature controllers

Start with the existing feature hooks. Do not introduce a global state library.

### Batch A: isolated features

Extract controller composition for:

- Hosted agent
- Prompt Azure Architect Agent
- YouTube summarization
- Document Q&A
- Image generation, editing, and comparison

Each controller returns an explicit feature view model:

```ts
type FeatureController = {
  state: FeatureState;
  actions: FeatureActions;
};
```

The controller owns feature state and event handling. `AppWorkspace` only receives and routes the result.

### Batch B: voice features

Extract separate controllers for:

- Browser speech
- Traditional STT -> chat -> TTS
- Recorded transcription
- Transcription comparison
- Realtime voice
- Realtime transcription through WebRTC
- Realtime transcription through WebSocket
- Voice Live
- Live translation

Shared audio helpers may remain shared, but session state remains feature-specific.

### Batch C: chat and conversations

Extract:

- Conversation loading, creation, selection, and deletion
- Text-chat submission
- Comparison submission
- Message state
- Use-case session cancellation
- Conversation refresh behavior

This is the most coupled frontend slice and follows the simpler feature extractions.

### Batch D: administration

Extract:

- Model catalog
- Model settings
- Guardrail comparison
- Deployment administration
- Metrics
- Use-case resource settings

### Acceptance criteria

- `AppWorkspace` contains no feature-specific API calls.
- Feature start, cancel, and reset effects live with their controllers.
- Existing controller tests continue to pass.
- Each extracted controller has observable behavior tests where existing coverage is insufficient.
- No visual or interaction changes.

## Phase 3 — Split workspace rendering

`WorkspaceContentRouter.tsx` is becoming a second central module and should be addressed after controller extraction.

### Target structure

```text
frontend/src/app/workspace/
  WorkspaceContentRouter.tsx
  routes/
    ChatRoute.tsx
    AgentRoute.tsx
    VoiceRoute.tsx
    ImageRoute.tsx
    SettingsRoute.tsx
    MetricsRoute.tsx
```

Each route component receives a narrow view model rather than one large aggregate prop structure.

### Registry improvement

Extend use-case registration so it becomes the authoritative relationship between:

- Use-case ID
- Metadata
- Workspace type
- Workspace renderer
- Feature capabilities

Adding a use case should not require adding feature logic to `AppWorkspace`.

### Acceptance criteria

- `WorkspaceContentRouter` selects routes but does not implement them.
- Route components do not receive unrelated feature state.
- Adding a use case does not require modifying `AppWorkspace`.
- Existing router behavior tests are migrated to relevant route tests.
- The marketplace registry still rejects duplicate or incomplete registrations.

## Phase 4 — Move backend entities and ports inward

Current persistence contracts depend on `app.infrastructure.persistence.models`, so the boundary is not yet clean.

### Move business types into the domain

Create domain-owned types for:

- `Conversation`
- `ConversationMessage`
- `ModelSettings`
- `UseCaseBinding`
- `GuardrailVariant`
- Message roles and model modalities

Infrastructure repositories consume these domain types.

### Move repository protocols into application ports

Suggested structure:

```text
app/application/
  ports/
    conversations.py
    model_settings.py
    use_case_settings.py
    foundry_chat.py
    foundry_management.py
```

Infrastructure implements these protocols.

### Acceptance criteria

- `app/domain` imports no application, API, or infrastructure modules.
- `app/application` imports no `app.api` or `app.infrastructure` modules.
- SQLite and Cosmos implement the same application-owned protocols.
- Repository contract tests cover both implementations.

## Phase 5 — Introduce typed application commands and results

FastAPI's `ChatRequest` currently flows directly into application services.

### Application commands

Introduce framework-independent application types, for example:

```python
@dataclass(frozen=True)
class ChatCommand:
    model: str
    prompt: str
    conversation_id: str | None
    reasoning_effort: ReasoningEffort | None
    guardrail_comparison: bool
    use_case: str
```

FastAPI request models validate HTTP input and map to these commands.

### Typed results

Introduce typed contracts for:

- Chat completion result
- Chat stream events
- Foundry request trace
- Foundry response trace
- Token usage
- Guardrail results
- Model discovery
- Deployment creation

Use:

- Dataclasses for application and domain values
- `TypedDict` only where dictionary behavior is genuinely required
- Pydantic models at HTTP boundaries
- `Any` only for provider payload fragments that cannot reasonably be modeled

### Acceptance criteria

- Application services do not accept Pydantic or FastAPI request models.
- SSE events form a discriminated typed union.
- Renaming a required response field causes a static or test failure.
- External HTTP response bodies remain unchanged.

## Phase 6 — Replace service locators with dependency injection

Application functions currently call `get_repositories()` directly, while `ChatService` constructs its default Azure gateway.

### Target composition

Create an application service container at startup:

```python
@dataclass(frozen=True)
class ApplicationServices:
    chat: ChatService
    conversations: ConversationService
    models: ModelService
    administration: AdministrationService
```

`app/main.py` or an API dependency module composes:

- SQLite or Cosmos repositories
- Foundry chat gateway
- Foundry management gateway
- Azure credential provider
- Application services

Routers receive services through FastAPI dependencies.

### Acceptance criteria

- No `get_repositories()` calls inside `app/application`.
- Application services require ports through constructors.
- Tests can supply in-memory or fake ports without patching module globals.
- Provider selection remains a startup and composition concern.
- No request constructs a new repository registry.

## Phase 7 — Split large backend modules by responsibility

Do this after typed contracts and dependency injection are established.

### `chat.py`

Split into:

- Chat preparation
- Completion orchestration
- Streaming orchestration
- Guardrail comparison
- Provider error translation

### `conversations.py`

Split into:

- Conversation service
- Message service
- Cursor encoding and validation
- Usage metrics calculation

### `foundry_admin.py`

Split into:

- Deployment discovery
- Deployment creation
- SKU and version selection
- Foundry management adapter

### Acceptance criteria

- Modules are split by responsibility, not arbitrary line count.
- No circular dependencies.
- Public application operations remain obvious and small.
- Provider-specific handling remains outside domain code.

## Phase 8 — Enforce architecture automatically

Add lightweight boundary checks after the migration.

### Rules

- `app/domain/**` cannot import `app.api`, `app.application`, or `app.infrastructure`.
- `app/application/**` cannot import `app.api` or `app.infrastructure`.
- Frontend feature code cannot import `AppWorkspace`.
- `AppWorkspace` cannot directly import individual feature API modules.
- Use-case IDs remain unique and fully registered.

Enforce these with focused tests or existing lint tooling. Avoid adding a heavy architecture framework.

## Verification for every phase

### Frontend

```powershell
npm run format:check
npm run lint
npm run test:coverage
npm run build
```

Behavior to preserve:

- Use-case switching
- Conversation lifecycle
- Chat and comparison streaming
- Cancellation and reset
- Voice session lifecycle
- Agent streaming
- Model and guardrail settings
- API tracing
- Authentication states

### Backend

```powershell
python -m ruff check app tests scripts
python -m mypy app
python -m pytest -q
python -m pip check
python -m pip_audit -r requirements.lock --strict
```

Contracts to preserve:

- Existing OpenAPI response schemas
- Authentication and tenant ownership
- SSE event format and order
- SQLite and Cosmos parity
- Keyset cursor behavior
- Guardrail comparison
- Error codes and request IDs

### Delivery

After all structural phases:

- Build the production container.
- Run the image vulnerability scan.
- Start the application from the built image.
- Exercise `/api/health` and `/api/ready`.
- Run the existing Container App revision and image smoke contract.

## Recommended execution order

1. Frontend isolated feature controllers
2. Frontend voice controllers
3. Frontend chat and conversation controller
4. Workspace route decomposition
5. Domain type relocation
6. Application-owned repository and gateway ports
7. Typed commands and results
8. Dependency injection
9. Backend module decomposition
10. Architecture enforcement

Each step should be independently reviewable and leave the repository passing all quality gates. The primary success criteria are dependency direction and feature ownership, not merely reducing line counts.
