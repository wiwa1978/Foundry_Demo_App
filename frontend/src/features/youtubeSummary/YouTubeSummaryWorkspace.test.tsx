import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { YouTubeSummaryWorkspace } from "./YouTubeSummaryWorkspace";
import type { YouTubeSummaryResult } from "./types";

const result: YouTubeSummaryResult = {
  video_id: "dQw4w9WgXcQ",
  source: "manual_captions",
  language: "en",
  transcript: "00:00 Hello world\n00:10 Next point",
  summary: [
    "## Key points",
    "",
    "- **Captions** were retrieved successfully.",
    "",
    "| Topic | Detail |",
    "| --- | --- |",
    "| Rendering | Markdown syntax becomes HTML |",
  ].join("\n"),
  model: "gpt-5.5",
  transcription_model: null,
  duration_ms: 1234,
  usage: {},
  foundry_requests: [],
  foundry_responses: [],
};

function renderWorkspace({
  loading = false,
  nextResult = result,
}: {
  loading?: boolean;
  nextResult?: YouTubeSummaryResult | null;
} = {}) {
  const view = render(
    <YouTubeSummaryWorkspace
      url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      language="en"
      model="gpt-5.5"
      models={["gpt-5.5"]}
      transcriptionModel="gpt-4o-mini-transcribe"
      transcriptionModels={["gpt-4o-mini-transcribe"]}
      result={nextResult}
      loading={loading}
      error=""
      onUrlChange={() => undefined}
      onLanguageChange={() => undefined}
      onModelChange={() => undefined}
      onTranscriptionModelChange={() => undefined}
      onSummarize={() => undefined}
    />,
  );
  return view;
}

describe("YouTubeSummaryWorkspace", () => {
  it("shows transcript first and renders summary markdown", () => {
    renderWorkspace();

    const transcript = screen.getByRole("region", {
      name: "Full transcript",
    });
    const summary = screen.getByRole("region", { name: "Summary" });

    expect(
      transcript.compareDocumentPosition(summary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(transcript).getByText(/00:00 Hello world/),
    ).toBeInTheDocument();
    expect(
      within(transcript).getByText("Transcription model: Not used (captions)"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("heading", { name: "Key points" }),
    ).toBeInTheDocument();
    expect(within(summary).getByRole("listitem")).toHaveTextContent(
      "Captions were retrieved successfully.",
    );
    expect(
      within(summary).getByRole("cell", {
        name: "Markdown syntax becomes HTML",
      }),
    ).toBeInTheDocument();
    expect(summary).not.toHaveTextContent("## Key points");
    expect(summary).not.toHaveTextContent("**Captions**");
  });

  it("labels the transcript with the audio transcription model", () => {
    renderWorkspace({
      nextResult: {
        ...result,
        source: "audio_transcription",
        transcription_model: "gpt-4o-mini-transcribe",
      },
    });

    expect(
      within(screen.getByRole("region", { name: "Full transcript" })).getByText(
        "Transcription model: GPT-4O-MINI-TRANSCRIBE",
      ),
    ).toBeInTheDocument();
  });

  it("rotates the video icon and shows progress copy while loading", () => {
    const { container } = renderWorkspace({ loading: true, nextResult: null });

    expect(
      screen.getByText(
        "Work in progress....Transcribing and Summarization almost ready",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });
});
