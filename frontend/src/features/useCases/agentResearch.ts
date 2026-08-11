import type { UseCaseModule } from "@/app/types";

export const agentResearchUseCase: UseCaseModule = {
  id: "agent_research",
  category: "agents",
  title: "Research Assistant Agent",
  typeLabel: "Prompt Agent",
  shortTitle: "Research agent",
  description:
    "Ask a published Foundry agent to research current topics using web search.",
  badge: "Agents",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The browser submits a question to the FastAPI /api/agent-research/stream endpoint.",
    "The backend connects to the published ResearchAgent through FOUNDRY_PROJECT_ENDPOINT.",
    "A temporary agent session is created and its Responses API output is streamed back to the UI.",
  ],
  codeSnippet: {
    title: "Foundry published agent session",
    language: "python",
    code: [
      "project = AIProjectClient(endpoint=settings.endpoint, credential=credential)",
      "agent_name = 'ResearchAgent'",
      "session = project.beta.agents.create_session(agent_name=agent_name)",
      "client = project.get_openai_client(agent_name=agent_name)",
      "",
      "stream = client.responses.create(",
      "    input=question,",
      "    extra_body={'agent_session_id': session.agent_session_id},",
      "    stream=True,",
      ")",
    ].join("\n"),
  },
  workspace: "agentResearch",
};

