import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextTranslationWorkspace } from "./TextTranslationWorkspace";
import type {
  LanguageServiceModeOption,
  LanguageServiceUseCaseId,
  TranslationModelOption,
  TextTranslationResult,
} from "./types";

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
  useCase = "text_translation",
  sourceText = "Doctor is available next Monday.",
  draftText = "Doctor is available next Monday.",
  audioEnabled = false,
}: {
  configured?: boolean;
  loading?: boolean;
  nextResult?: TextTranslationResult | null;
  useCase?: LanguageServiceUseCaseId;
  sourceText?: string;
  draftText?: string;
  audioEnabled?: boolean;
} = {}) {
  const modeOptions: readonly LanguageServiceModeOption[] = [
    {
      value: "translator_text",
      label: "Text Translation",
      implemented: true,
    },
    {
      value: "translator_document",
      label: "Document Translation",
      implemented: false,
    },
  ];
  const modelOptions: readonly TranslationModelOption[] = [
    { value: "azure-mt", label: "Azure-MT" },
    { value: "gpt-5.1", label: "gpt-5.1" },
  ];
  const onSourceTextChange = vi.fn();
  const onSpeakTranslation = vi.fn();
  return {
    ...render(
      <TextTranslationWorkspace
        configured={configured}
        useCase={useCase}
        mode="translator_text"
        modeOptions={modeOptions}
        modeImplemented
        sourceText={sourceText}
        sourceLanguage="auto"
        targetLanguage="es"
        model="azure-mt"
        modelOptions={modelOptions}
        result={nextResult}
        loading={loading}
        error=""
        audioEnabled={audioEnabled}
        speaking={false}
        onDraftTextChange={onSourceTextChange}
        draftText={draftText}
        onSourceLanguageChange={vi.fn()}
        onTargetLanguageChange={vi.fn()}
        onModelChange={vi.fn()}
        onModeChange={vi.fn()}
        onTranslate={vi.fn()}
        onSpeakTranslation={onSpeakTranslation}
      />,
    ),
    onSourceTextChange,
    onSpeakTranslation,
  };
}

describe("TextTranslationWorkspace", () => {
  it("renders source pane before translated pane with read-only display", () => {
    renderWorkspace();

    const source = screen
      .getByRole("heading", { name: "Source text" })
      .closest("section");
    const translated = screen
      .getByRole("heading", { name: "Translated text" })
      .closest("section");

    expect(source).toBeTruthy();
    expect(translated).toBeTruthy();
    expect(
      source!.compareDocumentPosition(translated!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(source!).getByText("Doctor is available next Monday."),
    ).toBeInTheDocument();
    expect(
      within(translated!).getByText(
        "El doctor está disponible el próximo lunes.",
      ),
    ).toBeInTheDocument();
    expect(
      within(translated!).getByText(/Detected English/),
    ).toBeInTheDocument();
  });

  it("shows configuration guidance when Translator is not configured", () => {
    renderWorkspace({ configured: false, nextResult: null });

    expect(
      screen.getByText(/Configure FOUNDRY_PROJECT_ENDPOINT/),
    ).toBeInTheDocument();
  });

  it("displays loading state in translated pane", () => {
    renderWorkspace({ loading: true });

    expect(
      screen.getByText("Detecting language and translating..."),
    ).toBeInTheDocument();
  });

  it("shows placeholder when no translation yet", () => {
    renderWorkspace({ nextResult: null });

    expect(
      screen.getByText("The translation appears here."),
    ).toBeInTheDocument();
  });

  it("loads a prepared sentence from the translation gallery", () => {
    const { onSourceTextChange } = renderWorkspace({
      sourceText: "",
      draftText: "",
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Translation sentence gallery/ }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Use prompt" })[0]);

    expect(onSourceTextChange).toHaveBeenCalledWith(
      "The doctor is available next Monday. Would you like me to schedule an appointment?",
    );
    expect(screen.getByText("Your text appears here.")).toBeInTheDocument();
  });

  it("switches the gallery to the active language-service use case", () => {
    renderWorkspace({ useCase: "pii_redaction" });

    expect(
      screen.getByRole("heading", { name: "PII redaction gallery" }),
    ).toBeInTheDocument();
  });

  it("shows the translated audio control when audio is enabled", () => {
    const { onSpeakTranslation } = renderWorkspace({ audioEnabled: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Play translated audio" }),
    );

    expect(onSpeakTranslation).toHaveBeenCalledOnce();
  });
});
