import { AzureArchitectAgentWorkspace } from "@/features/azureArchitectAgent/AzureArchitectAgentWorkspace";

import { hostedAgentPromptGallery } from "./prompts";
import type { HostedAgentRunConfig, HostedAgentStep } from "./types";

type Props = {
  configured: boolean;
  agentName: string | null;
  projectEndpoint: string | null;
  message: string;
  answer: string;
  steps: HostedAgentStep[];
  runConfig: HostedAgentRunConfig | null;
  isRunning: boolean;
  error: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function HostedAgentWorkspace(props: Props) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AzureArchitectAgentWorkspace
        configured={props.configured}
        projectEndpoint={props.projectEndpoint}
        question={props.message}
        answer={props.answer}
        steps={props.steps}
        citations={[]}
        runConfig={props.runConfig}
        isRunning={props.isRunning}
        error={props.error}
        onQuestionChange={props.onMessageChange}
        onSubmit={props.onSubmit}
        onCancel={props.onCancel}
        defaultAgentName={props.agentName ?? "hosted-assistant"}
        emptyStateTitle="Start your hosted agent"
        emptyStateDescription="Ask the code-hosted Agent Framework assistant a question."
        questionPlaceholder="Ask the hosted agent a question..."
        questionAriaLabel="Hosted agent question"
        activityDescription="Hosted endpoint and code invocation details"
        promptGallery={hostedAgentPromptGallery}
      />
    </div>
  );
}
