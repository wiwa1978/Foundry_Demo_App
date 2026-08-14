import { ComparisonWorkspace } from "@media/text_chat_comparison/frontend";
import { YouTubeSummaryWorkspace } from "@media/youtube_summary/frontend";
import { Infinity as InfinityIcon, Mic, MicOff, Plus } from "lucide-react";

import { reasoningEffortOptions } from "@/app/workspace/constants";
import { formatModelName } from "@/app/workspace/formatters";
import {
  ChatEmptyState,
  ComposerSelect,
  UseCaseComposer,
} from "@/app/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { GuardrailComparisonWorkspace } from "@/features/guardrails/GuardrailWorkspaces";
import { ChatMessageHistory } from "@/features/textChat/ChatMessages";
import type { ReasoningEffort } from "@/features/textChat/types";
import { cn } from "@/lib/utils";

import type {
  WorkspaceAccessViewModel,
  WorkspaceChatViewModel,
  WorkspaceComparisonViewModel,
  WorkspaceContentRoute,
  WorkspaceGuardrailsViewModel,
  WorkspaceYouTubeSummaryViewModel,
} from "./contracts";
const modelRouterRoutingOptions = [
  { value: "balanced", label: "Balanced routing" },
  { value: "quality", label: "Quality routing" },
  { value: "cost", label: "Cost routing" },
] as const;

type ChatRouteProps = {
  route: WorkspaceContentRoute;
  access: WorkspaceAccessViewModel;
  comparison: WorkspaceComparisonViewModel;
  guardrails: WorkspaceGuardrailsViewModel;
  youtubeSummary: WorkspaceYouTubeSummaryViewModel;
  chat: WorkspaceChatViewModel;
};

export function ChatRoute({
  route,
  access,
  comparison,
  guardrails,
  youtubeSummary,
  chat,
}: ChatRouteProps) {
  if (route.workspace === "comparison") {
    return (
      <ComparisonWorkspace
        {...comparison}
        speechRecognitionSupported={false}
        isListening={false}
      />
    );
  }
  if (route.workspace === "youtubeSummary") {
    return <YouTubeSummaryWorkspace {...youtubeSummary} />;
  }
  if (guardrails.enabled) {
    return (
      <GuardrailComparisonWorkspace
        model={chat.activeModel}
        policyNames={guardrails.policyNames}
        deploymentPolicyName={guardrails.deploymentPolicyName}
        messages={chat.messages}
        prompt={chat.prompt}
        isRunning={chat.isRunning}
        canSubmit={chat.canSubmit}
        onPromptChange={chat.onPromptChange}
        onSubmit={
          route.useCase === "document_qa"
            ? chat.onDocumentSubmit
            : chat.onSubmit
        }
        onOpenSettings={() => chat.onOpenSettings(chat.activeModel)}
      />
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-5">
        {chat.messages.length ? (
          <div className="mx-auto grid max-w-5xl gap-4">
            <ChatMessageHistory messages={chat.messages} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ChatEmptyState
              useCase={route.useCase}
              activeModel={chat.activeModel}
              onOpenUseCases={chat.onOpenUseCases}
            />
          </div>
        )}
      </div>
      <UseCaseComposer
        ariaLabel="Chat prompt"
        placeholder="Ask anything..."
        value={chat.prompt}
        disabled={!chat.canSubmit}
        submitting={chat.isRunning}
        disclaimer="AI-generated content may be incorrect"
        onChange={chat.onPromptChange}
        onSubmit={
          route.useCase === "document_qa"
            ? chat.onDocumentSubmit
            : chat.onSubmit
        }
        leftControls={
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!chat.activeModel || !access.canUseProtectedApis}
              onClick={() => chat.onOpenSettings(chat.activeModel)}
              title="Open active model settings"
              className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <ComposerSelect
              id="composer-model"
              ariaLabel="Composer model"
              value={chat.activeModel}
              onChange={chat.onActiveModelChange}
              options={chat.models.map((model) => ({
                value: model,
                label: formatModelName(model),
              }))}
            />
            {route.useCase === "document_qa" ? (
              <span className="rounded-full px-2 py-1 text-sm text-slate-700 dark:text-slate-200">
                Document RAG
              </span>
            ) : null}
          </>
        }
        rightControls={
          <>
            {route.enableComposerDictation ? (
              <>
                <InfinityIcon
                  className="h-4 w-4 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <Button
                  type="button"
                  variant={chat.isListening ? "destructive" : "ghost"}
                  size="icon"
                  disabled={!chat.speechRecognitionSupported}
                  onClick={chat.onToggleDictation}
                  title={
                    chat.isListening
                      ? "Stop browser dictation"
                      : "Start browser dictation (speech-to-text into the prompt)"
                  }
                  className={cn(
                    "h-8 w-8 rounded-full",
                    !chat.isListening &&
                      "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100",
                  )}
                >
                  {chat.isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </>
            ) : null}
            {chat.modelRouterRouting ? (
              <>
                <ComposerSelect
                  id="composer-router-routing"
                  ariaLabel="Model router routing mode"
                  value={chat.modelRouterRouting.mode}
                  onChange={(value) =>
                    chat.modelRouterRouting?.onChange(
                      value as typeof chat.modelRouterRouting.mode,
                    )
                  }
                  options={[...modelRouterRoutingOptions]}
                  disabled={
                    chat.isRunning ||
                    chat.modelRouterRouting.loading ||
                    chat.modelRouterRouting.saving
                  }
                  title="Model router routing mode is a deployment setting and can take up to five minutes to apply."
                />
                {chat.modelRouterRouting.error ? (
                  <span className="max-w-48 truncate text-xs text-red-600 dark:text-red-300">
                    {chat.modelRouterRouting.error}
                  </span>
                ) : null}
              </>
            ) : null}
            <ComposerSelect
              id="composer-reasoning"
              ariaLabel="Reasoning level"
              value={chat.reasoningEffort}
              onChange={(value) =>
                chat.onReasoningEffortChange(value as ReasoningEffort)
              }
              options={reasoningEffortOptions}
              title="Reasoning effort is sent to Responses API reasoning-capable deployments."
            />
          </>
        }
      />
    </>
  );
}
