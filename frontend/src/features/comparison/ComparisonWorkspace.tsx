import {
  Bot,
  ChevronsUpDown,
  GitCompareArrows,
  Mic,
  MicOff,
  Settings,
} from "lucide-react";
import type { FormEvent } from "react";

import { formatModelName } from "@/app/workspace/formatters";
import { UseCaseComposer } from "@/app/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import {
  ComparisonModelResponse,
  groupComparisonTurns,
} from "@/features/textChat/ChatMessages";
import type { ChatMessage } from "@/features/textChat/types";

type ComparisonWorkspaceProps = {
  allModels: string[];
  models: string[];
  messages: ChatMessage[];
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  speechRecognitionSupported: boolean;
  isListening: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onToggleDictation: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
};

export function ComparisonWorkspace({
  allModels,
  models,
  messages,
  prompt,
  isRunning,
  canSubmit,
  speechRecognitionSupported,
  isListening,
  onPromptChange,
  onSubmit,
  onToggleDictation,
  onOpenSettings,
  onModelChange,
}: ComparisonWorkspaceProps) {
  const turns = groupComparisonTurns(messages);

  if (!models.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <GitCompareArrows className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-[#77777d]" />
          <h3 className="text-lg font-semibold">Select models to compare</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Turn on one or more model endpoints in the comparison list to start
            side-by-side testing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <div className="flex-1 overflow-x-auto p-4">
        <div
          className="grid h-full min-w-[44rem] gap-4"
          style={{
            gridTemplateColumns: `repeat(${models.length}, minmax(20rem, 1fr))`,
          }}
        >
          {models.map((model) => (
            <ComparisonModelPane
              key={model}
              allModels={allModels}
              selectedModels={models}
              model={model}
              turns={turns}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              speechRecognitionSupported={speechRecognitionSupported}
              isListening={isListening}
              onPromptChange={onPromptChange}
              onSubmit={onSubmit}
              onToggleDictation={onToggleDictation}
              onOpenSettings={onOpenSettings}
              onModelChange={onModelChange}
            />
          ))}
        </div>
      </div>
      <p className="border-t bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-[#55555a] dark:bg-[#29292c] dark:text-slate-400">
        Text typed in any comparison prompt is mirrored to every pane. Sending
        dispatches the same prompt to all selected models.
      </p>
    </div>
  );
}

type ComparisonModelPaneProps = {
  allModels: string[];
  selectedModels: string[];
  model: string;
  turns: Array<{ user: ChatMessage; responses: ChatMessage[] }>;
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  speechRecognitionSupported: boolean;
  isListening: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onToggleDictation: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
};

function ComparisonModelPane({
  allModels,
  selectedModels,
  model,
  turns,
  prompt,
  isRunning,
  canSubmit,
  speechRecognitionSupported,
  isListening,
  onPromptChange,
  onSubmit,
  onToggleDictation,
  onOpenSettings,
  onModelChange,
}: ComparisonModelPaneProps) {
  function submitPanePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={submitPanePrompt}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
    >
      <header className="flex items-center gap-2 border-b px-3 py-3 dark:border-[#55555a]">
        <div className="relative min-w-0 flex-1">
          <select
            aria-label={`Model for comparison pane ${model}`}
            value={model}
            onChange={(event) => onModelChange(model, event.target.value)}
            className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
          >
            {allModels.map((option) => (
              <option
                key={option}
                value={option}
                disabled={option !== model && selectedModels.includes(option)}
              >
                {formatModelName(option)}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onOpenSettings(model)}
          title={`Open settings for ${model}`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {turns.length ? (
          <div className="grid gap-4">
            {turns.map((turn) => {
              const responses = turn.responses.filter(
                (item) => item.model === model,
              );
              return (
                <section key={turn.user.id} className="grid gap-2">
                  <div className="chat-user-bubble ml-auto max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm">
                    {turn.user.content}
                  </div>
                  {responses.length ? (
                    <div className="grid gap-2">
                      {responses.map((response) => (
                        <ComparisonModelResponse
                          key={response.id}
                          message={response}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-500 shadow-sm dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-400">
                      Waiting for this model...
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-xs">
              <Bot className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#77777d]" />
              <h3 className="text-sm font-semibold">
                Ready for {formatModelName(model)}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Type in any pane below. Every input stays synchronized.
              </p>
            </div>
          </div>
        )}
      </div>

      <UseCaseComposer
        ariaLabel={`Prompt for ${model}`}
        placeholder="Ask all selected models..."
        value={prompt}
        disabled={!canSubmit}
        submitting={isRunning}
        disclaimer="AI-generated content may be incorrect"
        onChange={onPromptChange}
        onSubmit={onSubmit}
        leftControls={
          <span className="text-xs font-medium">{formatModelName(model)}</span>
        }
        rightControls={
          <Button
            type="button"
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            disabled={!speechRecognitionSupported}
            onClick={onToggleDictation}
            title={
              isListening
                ? "Stop browser dictation"
                : "Start browser dictation (speech-to-text into the prompt)"
            }
            className="h-8 w-8 rounded-full"
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        }
      />
    </form>
  );
}
