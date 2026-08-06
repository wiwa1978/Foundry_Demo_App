import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useCaseModules } from "@/app/useCaseRegistry";

import { UseCaseMarketplace } from "./UseCaseMarketplace";

describe("UseCaseMarketplace", () => {
  it("selects a use case", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <UseCaseMarketplace
        activeUseCase="text_chat"
        useCases={useCaseModules}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /document q&a/i }));

    expect(onSelect).toHaveBeenCalledWith("document_qa");
  });

  it("filters use cases by modality", async () => {
    const user = userEvent.setup();

    render(
      <UseCaseMarketplace
        activeUseCase="text_chat"
        useCases={useCaseModules}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /image/i }));

    expect(screen.getByRole("button", { name: /text to image/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /text chat/i })).not.toBeInTheDocument();
  });

  it("closes with Escape and exposes dialog semantics", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <UseCaseMarketplace
        activeUseCase="text_chat"
        useCases={useCaseModules}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Choose a use case" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
