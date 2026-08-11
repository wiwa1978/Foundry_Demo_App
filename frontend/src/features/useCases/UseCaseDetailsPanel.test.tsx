import { textChatUseCase } from "@media/text_chat/module";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UseCaseDetailsPanel } from "./UseCaseDetailsPanel";

describe("UseCaseDetailsPanel", () => {
  it("is an accessible modal and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UseCaseDetailsPanel useCase={textChatUseCase} onClose={onClose} />);
    expect(
      screen.getByRole("dialog", { name: "Text Chat" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
