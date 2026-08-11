import type { UseCaseModule } from "@/app/types";

export const hostedAgentUseCase: UseCaseModule = {
  id: "hosted_agent",
  category: "agents",
  title: "Research Assistant Agent",
  typeLabel: "Hosted Agent",
  frameworkLabel: "Microsoft Agent Framework",
  shortTitle: "Hosted agent",
  description:
    "Run custom Microsoft Agent Framework code registered and hosted by Foundry Agent Service.",
  badge: "Code + Host",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The Microsoft Agent Framework source lives under usecases_agents/research_assistant_hosted/microsoft_agent_framework.",
    "Foundry builds and hosts the Python code with the Responses protocol.",
    "The app invokes the registered endpoint by hosted agent name and streams its output.",
  ],
  codeSnippet: {
    title: "Invoke a routed hosted agent",
    language: "python",
    code: [
      "project = AIProjectClient(endpoint=endpoint, credential=credential)",
      "client = project.get_openai_client(agent_name='hosted-assistant')",
      "stream = client.responses.create(input=message, stream=True)",
    ].join("\n"),
  },
  workspace: "hostedAgent",
};
