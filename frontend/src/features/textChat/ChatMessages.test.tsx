import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatBubble } from "./ChatMessages";

import type { ChatMessage } from "./types";

describe("ChatBubble", () => {
  it("shows the concrete routed model when a router deployment answered", () => {
    const message: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "Hello!",
      model: "model-router",
      routed_model: "gpt-5.4-mini-2026-03-17",
      api_surface: "chat_completions",
    };

    render(<ChatBubble message={message} />);

    expect(
      screen.getByText("Answered by GPT-5.4-MINI-2026-03-17"),
    ).toBeVisible();
  });
});
