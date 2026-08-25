import type { UseCaseModule } from "@/app/types";

export const azureArchitectAgentUseCase: UseCaseModule = {
  id: "azure_architect_agent",
  category: "agents",
  title: "Azure Architect",
  shortTitle: "Azure Architect",
  showLabels: false,
  description:
    "Ask the Azure Architect Agent to look things up using web search. Use the 'Agent implementation' dropdown to switch between a published Foundry Prompt Agent and any hosted Microsoft Agent Framework deployment style (AZD, container, LangChain, LangGraph, Pydantic AI...).",
  badge: "Agents",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The 'Agent implementation' dropdown in the sidebar switches between Prompt Agent and Hosted Agent mode without leaving the workspace.",
    "Prompt Agent mode submits the question to the FastAPI /api/azure-architect-agent/stream endpoint, which connects to the published azure-architect-prompt agent through FOUNDRY_PROJECT_ENDPOINT and streams a temporary agent session's Responses API output back to the UI.",
    "Hosted Agent mode calls /api/hosted-agent/stream. Each variant is a separate Microsoft Agent Framework project (see usecases_agents/azure_architect_agent/prompt and azure_architect_agent/hosted, plus the sibling Foundry Agents projects for AZD, Code, Containers, LangChain, LangGraph, and Pydantic AI); FOUNDRY_HOSTED_AGENT_VARIANTS registers every deployed agent name and a second 'Hosted agent implementation' dropdown picks which one to stream from.",
  ],
  codeSnippet: {
    title: "Foundry published agent session",
    language: "python",
    code: [
      "project = AIProjectClient(endpoint=settings.endpoint, credential=credential)",
      "agent_name = 'azure-architect-prompt'",
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
  workspace: "azureArchitectAgent",
};
