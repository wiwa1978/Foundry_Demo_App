import { LiveTranslationHero } from "@media/live_translation/frontend";
import { RealtimeTranscriptionHero as RealtimeTranscriptionWebRtcHero } from "@media/realtime_transcription_webrtc/frontend";
import { RealtimeTranscriptionHero as RealtimeTranscriptionWebSocketHero } from "@media/realtime_transcription_websocket/frontend";
import { RealtimeTranslationHero } from "@media/realtime_translation_websocket/frontend";
import { RealtimeVoiceHero } from "@media/realtime_voice/frontend";
import { TranscriptionWorkspace } from "@media/recorded_transcription/frontend";
import { TraditionalVoiceWorkspace } from "@media/stt_chat_tts/frontend";
import { TranscriptionComparisonWorkspace } from "@media/transcription_comparison/frontend";
import { VoiceLiveHero } from "@media/voice_live/frontend";

import type {
  WorkspaceContentRoute,
  WorkspaceRealtimeViewModel,
  WorkspaceTraditionalVoiceViewModel,
  WorkspaceTranscriptionComparisonViewModel,
  WorkspaceTranscriptionViewModel,
} from "./contracts";

type VoiceRouteProps = {
  route: WorkspaceContentRoute;
  traditionalVoice: WorkspaceTraditionalVoiceViewModel;
  transcription: WorkspaceTranscriptionViewModel;
  transcriptionComparison: WorkspaceTranscriptionComparisonViewModel;
  realtime: WorkspaceRealtimeViewModel;
};

export function VoiceRoute({
  route,
  traditionalVoice,
  transcription,
  transcriptionComparison,
  realtime,
}: VoiceRouteProps) {
  if (route.workspace === "traditionalVoice") {
    return (
      <TraditionalVoiceWorkspace
        configured={traditionalVoice.configured}
        activeModel={traditionalVoice.activeModel}
        chatModels={traditionalVoice.chatModels}
        onChatModelChange={traditionalVoice.onChatModelChange}
        transcriptionModels={traditionalVoice.transcriptionModels}
        transcriptionModel={traditionalVoice.transcriptionModel}
        onTranscriptionModelChange={traditionalVoice.onTranscriptionModelChange}
        ttsModels={traditionalVoice.ttsModels}
        ttsModel={traditionalVoice.ttsModel}
        onTtsModelChange={traditionalVoice.onTtsModelChange}
        ttsVoice={traditionalVoice.ttsVoice}
        ttsVoices={traditionalVoice.ttsVoices}
        onTtsVoiceChange={traditionalVoice.onTtsVoiceChange}
        status={traditionalVoice.status}
        error={traditionalVoice.error}
        result={traditionalVoice.result}
        onStart={() => traditionalVoice.onStart(traditionalVoice.request)}
        onStop={traditionalVoice.onStop}
      />
    );
  }

  if (route.workspace === "transcribe") {
    return <TranscriptionWorkspace {...transcription} />;
  }
  if (route.workspace === "transcriptionComparison") {
    return <TranscriptionComparisonWorkspace {...transcriptionComparison} />;
  }
  if (route.workspace === "realtimeVoice") {
    return (
      <HeroFrame>
        <RealtimeVoiceHero {...realtime.session} />
      </HeroFrame>
    );
  }
  if (route.workspace === "realtimeTranscriptionWebRtc") {
    return (
      <RealtimeTranscriptionWebRtcHero
        {...realtime.webRtcTranscription}
        transport="WebRTC"
      />
    );
  }
  if (route.workspace === "realtimeTranscriptionWebSocket") {
    return (
      <RealtimeTranscriptionWebSocketHero
        {...realtime.webSocketTranscription}
        transport="WebSockets"
      />
    );
  }
  if (route.workspace === "realtimeTranslationWebSocket") {
    return (
      <HeroFrame wide>
        <RealtimeTranslationHero {...realtime.webSocketTranslation} />
      </HeroFrame>
    );
  }
  if (route.workspace === "voiceLive") {
    return (
      <HeroFrame>
        <VoiceLiveHero {...realtime.voiceLive} />
      </HeroFrame>
    );
  }
  return (
    <HeroFrame>
      <LiveTranslationHero {...realtime.liveTranslation} />
    </HeroFrame>
  );
}

function HeroFrame({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex-1 overflow-auto p-5">
      <div
        className={`mx-auto flex min-h-full ${wide ? "max-w-5xl" : "max-w-4xl"} items-center justify-center`}
      >
        {children}
      </div>
    </div>
  );
}
