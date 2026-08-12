import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AgentRoute } from "./routes/AgentRoute";
import { ChatRoute } from "./routes/ChatRoute";
import type { WorkspaceContentRouterProps } from "./routes/contracts";
import { ImageRoute } from "./routes/ImageRoute";
import { MetricsRoute } from "./routes/MetricsRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { VoiceRoute } from "./routes/VoiceRoute";

export function WorkspaceContentRouter(props: WorkspaceContentRouterProps) {
  const { route, access } = props;

  if (access.locked) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200">
            <LogIn className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-semibold">
            {access.checking ? "Checking access..." : "Sign in to Foundry Demo"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {access.checking
              ? "Confirming your Microsoft account session."
              : "Use your Microsoft account to access chat, voice, document, and model comparison demos."}
          </p>
          {!access.checking ? (
            <Button type="button" className="mt-6" onClick={access.onSignIn}>
              <LogIn className="h-4 w-4" />
              Sign in with Microsoft
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (route.view === "metrics") {
    return <MetricsRoute metrics={props.metrics} />;
  }
  if (route.view === "settings" || route.view === "model-settings") {
    return <SettingsRoute route={route} settings={props.settings} />;
  }

  switch (route.renderer) {
    case "agent":
      return (
        <AgentRoute
          route={route}
          agentResearch={props.agentResearch}
          hostedAgent={props.hostedAgent}
        />
      );
    case "image":
      return <ImageRoute route={route} images={props.images} />;
    case "voice":
      return (
        <VoiceRoute
          route={route}
          traditionalVoice={props.traditionalVoice}
          transcription={props.transcription}
          transcriptionComparison={props.transcriptionComparison}
          realtime={props.realtime}
        />
      );
    case "chat":
      return (
        <ChatRoute
          route={route}
          access={access}
          comparison={props.comparison}
          guardrails={props.guardrails}
          youtubeSummary={props.youtubeSummary}
          chat={props.chat}
        />
      );
  }
}
