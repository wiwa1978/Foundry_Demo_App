import { describe, expect, it, vi } from "vitest";

import { createRealtimeSession, liveInterpreterUrl, voiceLiveUrl } from "./api";

describe("Voice API", () => {
  it("creates a realtime session through the canonical endpoint", async () => {
    const fetchClient = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await createRealtimeSession(fetchClient, {
      model: "realtime",
      instructions: "Be concise",
      voice: "alloy",
    });
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/realtime/session",
      expect.objectContaining({ method: "POST" }),
      expect.any(Object),
    );
  });

  it("builds same-origin secure websocket URLs", () => {
    expect(voiceLiveUrl()).toContain("/api/voice-live");
    expect(liveInterpreterUrl()).toContain("/api/live-interpreter");
  });
});
