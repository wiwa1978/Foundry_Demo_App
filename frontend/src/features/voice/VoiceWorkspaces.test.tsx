import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AzureSpeechLiveTranslationWorkspace,
  GptRealtimeTranslationWorkspace,
  VoiceLiveHero,
} from "./VoiceWorkspaces";

const noop = vi.fn();

describe("translation workspaces", () => {
  it("renders GPT realtime translate-from and translate-to controls", () => {
    render(
      <GptRealtimeTranslationWorkspace
        configured={true}
        model="gpt-realtime-translate"
        transcriptionModel="gpt-realtime-whisper"
        models={["gpt-realtime-translate"]}
        sourceLanguage="auto"
        status="idle"
        error=""
        targetLanguage="fr"
        sourceTranscript=""
        translatedTranscript=""
        onModelChange={noop}
        onSourceLanguageChange={noop}
        onTargetLanguageChange={noop}
        onStart={noop}
        onStop={noop}
      />,
    );

    expect(screen.getByText("Translate from")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Auto-detect" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Translate to")).toBeInTheDocument();
  });

  it("renders Azure Speech original and translated sections", () => {
    render(
      <AzureSpeechLiveTranslationWorkspace
        configured={true}
        status="idle"
        error=""
        mode="standard"
        sourceLanguage="en-US"
        targetLanguage="fr"
        transcript={[]}
        sourceTranscript="Good morning"
        translatedTranscript="Bonjour"
        audioPlaybackEnabled={true}
        onModeChange={noop}
        onSourceLanguageChange={noop}
        onTargetLanguageChange={noop}
        onAudioPlaybackEnabledChange={noop}
        onStart={noop}
        onStop={noop}
      />,
    );

    expect(screen.getByText("ORIGINAL RAW TRANSCRIPT")).toBeInTheDocument();
    expect(screen.getByText("Good morning")).toBeInTheDocument();
    expect(
      screen.getByText("Translated voice, audio, and text"),
    ).toBeInTheDocument();
    expect(screen.getByText("Bonjour")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Audio playback On" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Translate from")).toBeInTheDocument();
    expect(screen.getByText("Translate to")).toBeInTheDocument();
  });

  it("shows Azure Speech sections while actively listening before text arrives", () => {
    render(
      <AzureSpeechLiveTranslationWorkspace
        configured={true}
        status="live"
        error=""
        mode="standard"
        sourceLanguage="en-US"
        targetLanguage="fr"
        transcript={[]}
        sourceTranscript=""
        translatedTranscript=""
        audioPlaybackEnabled={false}
        onModeChange={noop}
        onSourceLanguageChange={noop}
        onTargetLanguageChange={noop}
        onAudioPlaybackEnabledChange={noop}
        onStart={noop}
        onStop={noop}
      />,
    );

    expect(screen.getByText("ORIGINAL RAW TRANSCRIPT")).toBeInTheDocument();
    expect(
      screen.getByText("Listening for original speech..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Translated voice, audio, and text"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for translated speech and audio..."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Audio playback Off" }),
    ).toBeInTheDocument();
  });

  it("toggles Azure Speech audio playback from the left pane", () => {
    const onAudioPlaybackEnabledChange = vi.fn();
    render(
      <AzureSpeechLiveTranslationWorkspace
        configured={true}
        status="live"
        error=""
        mode="standard"
        sourceLanguage="en-US"
        targetLanguage="fr"
        transcript={[]}
        sourceTranscript=""
        translatedTranscript=""
        audioPlaybackEnabled={true}
        onModeChange={noop}
        onSourceLanguageChange={noop}
        onTargetLanguageChange={noop}
        onAudioPlaybackEnabledChange={onAudioPlaybackEnabledChange}
        onStart={noop}
        onStop={noop}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Audio playback On" }));

    expect(onAudioPlaybackEnabledChange).toHaveBeenCalledWith(false);
  });

  it("renders Voice Live with the shared two-pane listening layout", () => {
    render(
      <VoiceLiveHero
        configured={true}
        model="gpt-realtime"
        voice="en-US-Ava:DragonHDLatestNeural"
        status="live"
        error=""
        transcript={[
          { id: "user-1", source: "user", text: "Plan Paris in May" },
          {
            id: "assistant-1",
            source: "assistant",
            text: "What is your budget?",
          },
          { id: "system-1", source: "system", text: "Connected to Voice Live" },
        ]}
        avatar={{
          audioRef: createRef<HTMLAudioElement>(),
          error: "",
          status: "speaking",
          videoRef: createRef<HTMLVideoElement>(),
        }}
        onStart={noop}
        onStop={noop}
      />,
    );

    expect(screen.getByText("Traveler speech")).toBeInTheDocument();
    expect(screen.getByText("Plan Paris in May")).toBeInTheDocument();
    expect(screen.getByText("Travel conversation")).toBeInTheDocument();
    expect(screen.getByText("What is your budget?")).toBeInTheDocument();
    expect(screen.getByText("Voice Live model")).toBeInTheDocument();
    expect(screen.getByText("Azure voice")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /End concierge call/i }),
    ).toBeInTheDocument();
  });

  it("renders Voice Live empty state and bottom control palette", () => {
    render(
      <VoiceLiveHero
        configured={false}
        model="gpt-realtime"
        voice="en-US-Ava:DragonHDLatestNeural"
        status="idle"
        error=""
        transcript={[]}
        avatar={{
          audioRef: createRef<HTMLAudioElement>(),
          error: "",
          status: "idle",
          videoRef: createRef<HTMLVideoElement>(),
        }}
        onStart={noop}
        onStop={noop}
      />,
    );

    expect(screen.getByText("Voice Live travel concierge")).toBeInTheDocument();
    expect(screen.getByText("Voice Live model")).toBeInTheDocument();
    expect(screen.getByText("Azure voice")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Call the concierge/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Set AZURE_VOICELIVE_ENDPOINT/),
    ).toBeInTheDocument();
  });
});
