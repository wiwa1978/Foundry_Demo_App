import { AzureArchitectAgentWorkspace } from "@/features/azureArchitectAgent/AzureArchitectAgentWorkspace";

import type {
  InvestmentPlannerRunConfig,
  InvestmentPlannerStep,
} from "./types";

type Props = {
  configured: boolean;
  agentName: string | null;
  projectEndpoint: string | null;
  question: string;
  answer: string;
  steps: InvestmentPlannerStep[];
  runConfig: InvestmentPlannerRunConfig | null;
  isRunning: boolean;
  error: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function InvestmentPlannerWorkspace(props: Props) {
  return (
    <AzureArchitectAgentWorkspace
      configured={props.configured}
      projectEndpoint={props.projectEndpoint}
      question={props.question}
      answer={props.answer}
      steps={props.steps}
      citations={[]}
      runConfig={props.runConfig}
      isRunning={props.isRunning}
      error={props.error}
      onQuestionChange={props.onQuestionChange}
      onSubmit={props.onSubmit}
      onCancel={props.onCancel}
      defaultAgentName={props.agentName ?? "investment-planner"}
      emptyStateTitle="Plan a portfolio"
      emptyStateDescription="Ask the prompt agent to read your holdings from Blob Storage with its own identity and build a 6-month allocation plan."
      questionPlaceholder="Ask for a 6-month investment plan..."
      questionAriaLabel="Investment planner question"
      activityDescription="Skill invocations and agent identity details"
    />
  );
}
