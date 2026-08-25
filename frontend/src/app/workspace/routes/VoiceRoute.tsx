import { AzureSpeechTtsWorkspace } from "@media/azure_speech_tts/frontend";
import { FoundryGptAudioWorkspace } from "@media/foundry_gpt_audio/frontend";
import { AzureSpeechLiveTranslationWorkspace } from "@media/live_translation/frontend";
import { RealtimeTranscriptionHero as RealtimeTranscriptionWebRtcHero } from "@media/realtime_transcription_webrtc/frontend";
import { RealtimeTranscriptionHero as RealtimeTranscriptionWebSocketHero } from "@media/realtime_transcription_websocket/frontend";
import { GptRealtimeTranslationWorkspace } from "@media/realtime_translation_websocket/frontend";
import { RealtimeVoiceHero } from "@media/realtime_voice/frontend";
import { TranscriptionWorkspace } from "@media/recorded_transcription/frontend";
import { TraditionalVoiceWorkspace } from "@media/stt_chat_tts/frontend";
import { TextToSpeechAvatarWorkspace } from "@media/text_to_speech_avatar/frontend";
import { TranscriptionComparisonWorkspace } from "@media/transcription_comparison/frontend";
import { VoiceLiveHero } from "@media/voice_live/frontend";

import type {
  WorkspaceContentRoute,
  WorkspaceRealtimeViewModel,
  WorkspaceTextToSpeechAvatarViewModel,
  WorkspaceTextToSpeechSettings,
  WorkspaceTraditionalVoiceViewModel,
  WorkspaceTranscriptionComparisonViewModel,
  WorkspaceTranscriptionViewModel,
} from "./contracts";

type VoiceRouteProps = {
  route: WorkspaceContentRoute;
  traditionalVoice: WorkspaceTraditionalVoiceViewModel;
  azureSpeechTtsConfigured: boolean;
  textToSpeechAvatar?: WorkspaceTextToSpeechAvatarViewModel;
  foundryGptAudioConfigured: boolean;
  textToSpeech: WorkspaceTextToSpeechSettings;
  transcription: WorkspaceTranscriptionViewModel;
  transcriptionComparison: WorkspaceTranscriptionComparisonViewModel;
  realtime: WorkspaceRealtimeViewModel;
};

export function VoiceRoute({
  route,
  traditionalVoice,
  azureSpeechTtsConfigured,
  textToSpeechAvatar,
  foundryGptAudioConfigured,
  textToSpeech,
  transcription,
  transcriptionComparison,
  realtime,
}: VoiceRouteProps) {
  if (route.workspace === "traditionalVoice") {
    return (
      <TraditionalVoiceWorkspace
        configured={traditionalVoice.configured}
        languageLearning={route.useCase === "language_learning"}
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
  if (route.workspace === "azureSpeechTts") {
    return (
      <AzureSpeechTtsWorkspace
        configured={azureSpeechTtsConfigured}
        settings={textToSpeech}
      />
    );
  }
  if (route.workspace === "textToSpeechAvatar") {
    return textToSpeechAvatar ? (
      <TextToSpeechAvatarWorkspace {...textToSpeechAvatar} />
    ) : null;
  }
  if (route.workspace === "foundryGptAudio") {
    return (
      <FoundryGptAudioWorkspace
        configured={foundryGptAudioConfigured}
        settings={textToSpeech}
        mode="gptAudio"
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
  if (route.workspace === "realtimeTranslationWebRtc") {
    return <GptRealtimeTranslationWorkspace {...realtime.webRtcTranslation} />;
  }
  if (route.workspace === "realtimeTranslationWebSocket") {
    return (
      <GptRealtimeTranslationWorkspace {...realtime.webSocketTranslation} />
    );
  }
  if (route.workspace === "voiceLive") {
    return <VoiceLiveHero {...realtime.voiceLive} />;
  }
  return <AzureSpeechLiveTranslationWorkspace {...realtime.liveTranslation} />;
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
