import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextTranslationWorkspace } from "./TextTranslationWorkspace";
import type { TextTranslationResult } from "./types";

const result: TextTranslationResult = {
  source_language: null,
  detected_language: "en",
  target_language: "es",
  translated_text: "El doctor está disponible el próximo lunes.",
  translations: [
    {
      language: "es",
      text: "El doctor está disponible el próximo lunes.",
    },
  ],
};

function renderWorkspace({
  configured = true,
  loading = false,
  nextResult = result,
}: {
  configured?: boolean;
  loading?: boolean;
  nextResult?: TextTranslationResult | null;
} = {}) {
  return render(
    <TextTranslationWorkspace
      configured={configured}
      sourceText="Doctor is available next Monday."
      sourceLanguage="auto"
      targetLanguage="es"
      result={nextResult}
      loading={loading}
      error=""
      onSourceTextChange={() => undefined}
      onSourceLanguageChange={() => undefined}
      onTargetLanguageChange={() => undefined}
      onTranslate={vi.fn()}
    />,
  );
}

describe("TextTranslationWorkspace", () => {
  it("renders source pane before translated pane", () => {
    renderWorkspace();

    const source = screen.getByRole("heading", { name: "Source text" })
      .parentElement?.parentElement;
    const translated = screen.getByRole("heading", { name: "Translated text" })
      .parentElement?.parentElement;

    expect(source).toBeTruthy();
    expect(translated).toBeTruthy();
    expect(
      source!.compareDocumentPosition(translated!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(source!).getByText("Detected English")).toBeInTheDocument();
    expect(
      within(translated!).getByText(
        "El doctor está disponible el próximo lunes.",
      ),
    ).toBeInTheDocument();
  });

  it("offers auto-detect only in the source language dropdown", () => {
    renderWorkspace({ nextResult: null });

    expect(
      within(screen.getByLabelText("Translate from")).getByRole("option", {
        name: "Auto detect",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Translate to")).queryByRole("option", {
        name: "Auto detect",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows configuration guidance when Translator is not configured", () => {
    renderWorkspace({ configured: false, nextResult: null });

    expect(
      screen.getByText(/Configure FOUNDRY_PROJECT_ENDPOINT/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Translate" })).toBeDisabled();
  });
});
