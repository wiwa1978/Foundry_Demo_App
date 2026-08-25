import type { UseCaseModule } from "@/app/types";

export const retailAgentUseCase: UseCaseModule = {
  id: "retail_agent",
  category: "agents",
  title: "Zava Retail Shopping",
  showLabels: false,
  shortTitle: "Retail Assistant",
  description:
    "Browse the bundled Zava marketplace catalog, check inventory, and round-trip a shopping cart through a consolidated Retail Shopping Assistant.",
  badge: "Agents",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The FastAPI /api/retail-agent/stream endpoint uses Server-Sent Events rather than WebSockets.",
    "Phase one reuses repo2's bundled product catalog and keeps cart state in the request and completion event, so the service is safe to scale horizontally.",
    "The retail_agent/agent folder preserves repo2's agent, MCP, handoff, and initializer conventions without import-time environment requirements.",
  ],
  codeSnippet: {
    title: "Retail SSE request",
    language: "python",
    code: [
      "async for event in stream_retail_agent(",
      "    message, session_id=session_id, cart=cart",
      "):",
      "    yield f'data: {json.dumps(event)}\\n\\n'",
    ].join("\n"),
  },
  workspace: "retailAgent",
};
