import { beforeEach, describe, expect, it } from "vitest";

import { readActiveUseCase, writeActiveUseCase } from "./activeUseCaseStorage";

describe("active use case storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("falls back to text chat when storage is empty or invalid", () => {
    expect(readActiveUseCase()).toBe("text_chat");

    window.localStorage.setItem("foundry-chat-active-use-case", "missing");
    expect(readActiveUseCase()).toBe("text_chat");
  });

  it("persists a registered use case across remounts", () => {
    writeActiveUseCase("youtube_realtime_transcription");

    expect(readActiveUseCase()).toBe("youtube_realtime_transcription");
  });
});
