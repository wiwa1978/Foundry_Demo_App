import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { YouTubeRealtimeTranscriptionWorkspace } from "./YouTubeRealtimeTranscriptionWorkspace";

function renderWorkspace(
  overrides: Partial<
    Parameters<typeof YouTubeRealtimeTranscriptionWorkspace>[0]
  > = {},
) {
  const props: Parameters<typeof YouTubeRealtimeTranscriptionWorkspace>[0] = {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    model: "gpt-live-transcribe",
    models: ["gpt-live-transcribe", "gpt-realtime-whisper"],
    language: "auto",
    delay: "default",
    status: "idle",
    statusMessage: "",
    error: "",
    transcript: "",
    videoId: null,
    configured: true,
    onUrlChange: vi.fn(),
    onModelChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onDelayChange: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<YouTubeRealtimeTranscriptionWorkspace {...props} />);
  return props;
}

describe("YouTubeRealtimeTranscriptionWorkspace", () => {
  it("renders realtime model choices and starts transcription", async () => {
    const user = userEvent.setup();
    const props = renderWorkspace();

    expect(screen.getByText("gpt-live-transcribe")).toBeInTheDocument();
    expect(screen.getByText("gpt-realtime-whisper")).toBeInTheDocument();
    expect(screen.getByTitle("YouTube video player")).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.youtube.com/embed/dQw4w9WgXcQ?"),
    );
    await user.click(screen.getByRole("button", { name: "Transcribe" }));

    expect(props.onStart).toHaveBeenCalledOnce();
  });

  it("starts transcription when the embedded YouTube player starts playing", () => {
    const props = renderWorkspace();
    const player = screen.getByTitle(
      "YouTube video player",
    ) as HTMLIFrameElement;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ event: "onStateChange", info: 1 }),
        source: player.contentWindow,
      }),
    );

    expect(props.onStart).toHaveBeenCalledOnce();
  });

  it("starts transcription when focus moves into the YouTube iframe", () => {
    const props = renderWorkspace();

    fireEvent.focus(screen.getByTitle("YouTube video player"));

    expect(props.onStart).toHaveBeenCalledOnce();
  });

  it("shows streamed transcript and stops active sessions", async () => {
    const user = userEvent.setup();
    const props = renderWorkspace({
      status: "live",
      statusMessage: "Streaming YouTube audio into realtime transcription...",
      transcript: "Realtime transcript text.",
      videoId: "dQw4w9WgXcQ",
    });

    expect(screen.getByText("Realtime transcript text.")).toBeInTheDocument();
    expect(screen.getByText(/Streaming YouTube audio/)).toBeInTheDocument();
    expect(screen.getByTitle("YouTube video player")).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.youtube.com/embed/dQw4w9WgXcQ?"),
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it("explains that the project endpoint can configure realtime access", () => {
    renderWorkspace({ configured: false });

    expect(
      screen.getByText(/FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_REALTIME_ENDPOINT/),
    ).toBeInTheDocument();
  });
});
