import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FetchClient } from "@/api/types";

import { submitTextToSpeechAvatar } from "./api";
import { useTextToSpeechAvatar } from "./useTextToSpeechAvatar";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, submitTextToSpeechAvatar: vi.fn() };
});

describe("useTextToSpeechAvatar", () => {
  it("reports configuration errors and updates settings", async () => {
    const { result } = renderHook(() =>
      useTextToSpeechAvatar({
        configured: false,
        fetchClient: vi.fn<FetchClient>(),
      }),
    );

    act(() => {
      result.current.setLanguage("nl-NL");
      void result.current.start();
    });

    expect(result.current.language).toBe("nl-NL");
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toContain("Configure AZURE_SPEECH_ENDPOINT");
  });

  it("completes an avatar job that succeeds immediately", async () => {
    vi.mocked(submitTextToSpeechAvatar).mockResolvedValue({
      id: "job-1",
      status: "Succeeded",
      output_url: "https://example.test/video.mp4",
      summary_url: "https://example.test/summary.json",
    });
    const { result } = renderHook(() =>
      useTextToSpeechAvatar({
        configured: true,
        fetchClient: vi.fn<FetchClient>(),
      }),
    );

    await act(async () => {
      await result.current.start("Hello");
    });

    expect(result.current.status).toBe("succeeded");
    expect(result.current.jobId).toBe("job-1");
    expect(result.current.videoUrl).toContain("video.mp4");
    expect(result.current.summaryUrl).toContain("summary.json");
  });
});
