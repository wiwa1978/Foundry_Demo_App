import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSettingsPage } from "./AppSettingsPage";

function renderPage() {
  const onSaveUseCaseModelMap = vi.fn(async () => undefined);
  render(
    <AppSettingsPage
      models={["gpt-5.5"]}
      modelModalities={{ "gpt-5.5": ["text"] }}
      newModel=""
      message={null}
      colorPalette="foundry"
      canManageModels={true}
      liveTranslationSettings={{
        use_case: "live_translation",
        binding: "",
        available_bindings: [],
      }}
      liveTranslationSettingsLoading={false}
      liveTranslationSettingsSaving={false}
      liveTranslationSettingsMessage=""
      useCaseModelMap={{
        text_chat: "text_models",
        youtube_summary: {
          text: "text_models",
          transcription: "transcription_models",
        },
      }}
      useCaseModelBucketNames={[
        "models",
        "text_models",
        "image_models",
        "transcription_models",
        "realtime_transcription_models",
      ]}
      useCaseModelMapLoading={false}
      useCaseModelMapSaving={false}
      useCaseModelMapMessage=""
      onNewModelChange={vi.fn()}
      onAddModel={vi.fn()}
      onOpenAdmin={vi.fn()}
      onSaveLiveTranslationSettings={vi.fn(async () => undefined)}
      onSaveUseCaseModelMap={onSaveUseCaseModelMap}
      onSaveCapabilities={vi.fn(async () => undefined)}
      onColorPaletteChange={vi.fn()}
    />,
  );
  return { onSaveUseCaseModelMap };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("AppSettingsPage use case model map", () => {
  it("renders use case bucket mappings and saves edits", async () => {
    const user = userEvent.setup();
    const { onSaveUseCaseModelMap } = renderPage();
    expect(screen.queryByText("agent_research")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "agents" }));
    expect(screen.getByText("agent_research")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "media" }));


    expect(screen.getByText("Use case model buckets")).toBeVisible();
    expect(screen.getByText("text_chat")).toBeVisible();
    expect(screen.getByText("youtube_summary")).toBeVisible();

    expect(screen.getByText("text_to_image")).toBeVisible();
    const textChatBucket = screen.getByRole("combobox", {
      name: "Text Chat model bucket",
    });
    fireEvent.keyDown(textChatBucket, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "models" }), {
      key: "Enter",
    });
    await user.click(screen.getByRole("button", { name: "Save use case map" }));

    await waitFor(() => expect(onSaveUseCaseModelMap).toHaveBeenCalledOnce());
    expect(onSaveUseCaseModelMap).toHaveBeenCalledWith(
      expect.objectContaining({ text_chat: "models" }),
    );
  });
});
