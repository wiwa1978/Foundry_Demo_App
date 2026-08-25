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

  it("shows modality and function labels on use-case cards", () => {
    render(
      <UseCaseMarketplace
        activeUseCase="text_chat"
        useCases={useCaseModules}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /text.*active.*text chat/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /audio.*youtube video summarization.*transcription/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /text.*reasoning arena.*reasoning/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /audio.*youtube video transcription.*realtime transcription/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /audio.*gpt realtime translation webrtc.*foundry realtime translation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /audio.*gpt realtime translation websockets.*foundry realtime translation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /audio.*azure speech live translation.*azure speech translation/i,
      }),
    ).toBeInTheDocument();
  });

  it("switches to the agents category", async () => {
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

    await user.click(screen.getByRole("button", { name: /agents/i }));

    expect(
      screen.getByRole("button", {
        name: /Azure Architect/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Prompt Agent · Hosted Agent"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Microsoft Agent Framework"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ask the Azure Architect Agent to look things up/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /text chat/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Azure Architect/i,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("azure_architect_agent");
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

    expect(
      screen.getByRole("button", { name: /text to image/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /text chat/i }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("dialog", { name: "Foundry use cases" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
