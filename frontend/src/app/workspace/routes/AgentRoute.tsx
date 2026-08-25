import { AzureArchitectAgentWorkspace } from "@/features/azureArchitectAgent/AzureArchitectAgentWorkspace";
import { HostedAgentWorkspace } from "@/features/hostedAgent/HostedAgentWorkspace";
import { hostedAgentPromptGallery } from "@/features/hostedAgent/prompts";
import { InvestmentPlannerWorkspace } from "@/features/investmentPlanner/InvestmentPlannerWorkspace";
import { RetailAgentWorkspace } from "@/features/retailAgent/RetailAgentWorkspace";

import type {
  WorkspaceAzureArchitectAgentViewModel,
  WorkspaceContentRoute,
  WorkspaceHostedAgentViewModel,
  WorkspaceInvestmentPlannerViewModel,
  WorkspaceRetailAgentViewModel,
} from "./contracts";

export function AgentRoute({
  route,
  azureArchitectAgent,
  hostedAgent,
  investmentPlanner,
  retailAgent,
}: {
  route: WorkspaceContentRoute;
  azureArchitectAgent: WorkspaceAzureArchitectAgentViewModel;
  hostedAgent: WorkspaceHostedAgentViewModel;
  investmentPlanner: WorkspaceInvestmentPlannerViewModel;
  retailAgent?: WorkspaceRetailAgentViewModel;
}) {
  if (route.workspace === "hostedAgent") {
    return <HostedAgentWorkspace {...hostedAgent} />;
  }

  if (route.workspace === "investmentPlannerPrompt") {
    return <InvestmentPlannerWorkspace {...investmentPlanner} />;
  }
  if (route.workspace === "retailAgent") {
    return retailAgent ? <RetailAgentWorkspace {...retailAgent} /> : null;
  }

  return (
    <AzureArchitectAgentWorkspace
      configured={azureArchitectAgent.configured}
      projectEndpoint={azureArchitectAgent.projectEndpoint}
      question={azureArchitectAgent.question}
      answer={azureArchitectAgent.answer}
      steps={azureArchitectAgent.steps}
      citations={azureArchitectAgent.citations}
      runConfig={azureArchitectAgent.runConfig}
      isRunning={azureArchitectAgent.isRunning}
      error={azureArchitectAgent.error}
      trace={azureArchitectAgent.trace}
      traceLoading={azureArchitectAgent.traceLoading}
      traceError={azureArchitectAgent.traceError}
      onQuestionChange={azureArchitectAgent.onQuestionChange}
      onSubmit={azureArchitectAgent.onSubmit}
      onCancel={azureArchitectAgent.onCancel}
      promptGallery={hostedAgentPromptGallery}
    />
  );
}
