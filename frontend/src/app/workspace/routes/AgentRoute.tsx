import { AgentResearchWorkspace } from "@/features/agentResearch/AgentResearchWorkspace";
import { HostedAgentWorkspace } from "@/features/hostedAgent/HostedAgentWorkspace";

import type {
  WorkspaceAgentResearchViewModel,
  WorkspaceContentRoute,
  WorkspaceHostedAgentViewModel,
} from "./contracts";

export function AgentRoute({
  route,
  agentResearch,
  hostedAgent,
}: {
  route: WorkspaceContentRoute;
  agentResearch: WorkspaceAgentResearchViewModel;
  hostedAgent: WorkspaceHostedAgentViewModel;
}) {
  if (route.workspace === "hostedAgent") {
    return <HostedAgentWorkspace {...hostedAgent} />;
  }

  return (
    <AgentResearchWorkspace
      configured={agentResearch.configured}
      projectEndpoint={agentResearch.projectEndpoint}
      question={agentResearch.question}
      answer={agentResearch.answer}
      steps={agentResearch.steps}
      citations={agentResearch.citations}
      runConfig={agentResearch.runConfig}
      isRunning={agentResearch.isRunning}
      error={agentResearch.error}
      trace={agentResearch.trace}
      traceLoading={agentResearch.traceLoading}
      traceError={agentResearch.traceError}
      onQuestionChange={agentResearch.onQuestionChange}
      onSubmit={agentResearch.onSubmit}
      onCancel={agentResearch.onCancel}
    />
  );
}
