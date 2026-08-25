import type { UseCaseModule } from "@/app/types";

export const investmentPlannerPromptUseCase: UseCaseModule = {
  id: "investment_planner_prompt",
  category: "agents",
  title: "Investment Planner",
  showLabels: false,
  shortTitle: "Investment planner",
  description:
    "A configuration-only Foundry agent that reads holdings from Blob Storage with its own identity and builds a 6-month plan.",
  badge: "Agents",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The agent is published configuration - model, instructions, and tools - created by usecases_agents/investment_planner_prompt/agent/provision_agent.py.",
    "Two Foundry Skills back it: blob-reader downloads the holdings CSV under the agent's own Entra identity, and allocation-policy carries the house allocation rules.",
    "The backend streams the Responses API output and surfaces each skill invocation as a step in the Activity panel.",
  ],
  codeSnippet: {
    title: "A prompt agent is configuration, not code",
    language: "python",
    code: [
      "definition = PromptAgentDefinition(",
      "    model=resolve_model(),",
      "    instructions=INSTRUCTIONS,",
      "    temperature=0,",
      "    tools=[",
      "        CodeInterpreterTool(),",
      "        MCPTool(",
      "            server_url=f'{toolbox_mcp_url(endpoint)}?api-version=v1',",
      "            server_label='toolbox',",
      "            require_approval='never',",
      "            project_connection_id=TOOLBOX_CONNECTION_NAME,",
      "        ),",
      "    ],",
      ")",
      "definition['harness'] = 'ghcp'",
      "client.agents.create_version(agent_name=AGENT_NAME, definition=definition)",
    ].join("\n"),
  },
  workspace: "investmentPlannerPrompt",
};
