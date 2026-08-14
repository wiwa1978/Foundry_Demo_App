import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { deploymentDefaultGuardrail } from "@/app/workspace/constants";
import type { ConfigResponse } from "@/app/workspace/contracts";
import type { DocumentSummary } from "@/features/documentQa/types";

import {
  WorkspaceSidebar,
  type WorkspaceSidebarProps,
} from "./WorkspaceSidebar";

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const configured: ConfigResponse = {
  entra_auth_enabled: true,
  is_configured: true,
  endpoint: "https://foundry.example",
  models: ["model-a", "model-b", "model-c", "model-d"],
  is_realtime_configured: true,
  realtime_endpoint: "https://realtime.example",
  realtime_model: "realtime-model",
  embedding_model: "embedding-model",
  is_document_rag_configured: true,
  search_endpoint: "https://search.example",
  search_index_name: "documents",
  storage_account_url: "https://storage.example",
  storage_container_name: "uploads",
  is_traditional_voice_configured: true,
  transcription_model: "stt-a",
  tts_model: "tts-a",
  tts_voice: "alloy",
  is_speech_transcription_configured: true,
  speech_transcription_model: "transcribe-a",
  is_voice_live_configured: true,
  voice_live_model: "voice-live-a",
  voice_live_voice: "ava",
  is_live_interpreter_configured: true,
  is_text_translation_configured: true,
  is_content_extractor_configured: true,
};

const document: DocumentSummary = {
  id: "document-1",
  filename: "architecture.pdf",
  content_type: "application/pdf",
  byte_size: 2048,
  chunk_count: 4,
  blob_name: "documents/architecture.pdf",
  blob_url: "https://storage.example/architecture.pdf",
  created_at: "2026-08-07T10:00:00Z",
};

function sidebarProps(
  overrides: Partial<WorkspaceSidebarProps> = {},
): WorkspaceSidebarProps {
  return {
    workspace: {
      activeView: "chat",
      workspace: "chat",
      showDocumentControls: false,
      showBrowserVoiceControls: false,
      showComparisonControls: false,
      showImageComparisonControls: false,
      showTranscriptionComparisonControls: false,
      showEnableComparison: true,
      canUseProtectedApis: true,
      conversationsOpen: false,
      config: configured,
      onToggleConversations: vi.fn(),
      onEnableComparison: vi.fn(),
    },
    models: {
      activeModel: "model-a",
      catalogModels: configured.models,
      textModels: configured.models,
      transcriptionModels: ["transcribe-a", "transcribe-b"],
      transcriptionModel: "transcribe-a",
      onActiveModelChange: vi.fn(),
      onTranscriptionModelChange: vi.fn(),
      onOpenSettings: vi.fn(),
    },
    documents: {
      documents: [],
      loading: false,
      message: null,
      inputRef: createRef<HTMLInputElement>(),
      onUpload: vi.fn(),
      onRemove: vi.fn(),
    },
    contentExtractor: {
      configured: true,
      mode: "image",
      file: null,
      loading: false,
      error: "",
      samples: [],
      samplesLoading: false,
      sampleError: "",
      inputRef: createRef<HTMLInputElement>(),
      onModeChange: vi.fn(),
      onFileChange: vi.fn(),
      onSelectSample: vi.fn(),
    },
    browserSpeech: {
      availableSpeechVoices: [],
      isListening: false,
      selectedSpeechVoiceURI: "",
      selectedVoiceModel: "model-a",
      speechRecognitionSupported: false,
      speechSynthesisSupported: false,
      voiceError: "",
      voiceReadbackEnabled: false,
      onVoiceModelChange: vi.fn(),
      onSpeechVoiceChange: vi.fn(),
      onToggleDictation: vi.fn(),
      onToggleReadback: vi.fn(),
    },
    comparison: {
      selectedModels: new Set(["model-a", "model-b"]),
      onToggleModel: vi.fn(),
      selectedTranscriptionModels: new Set(["transcribe-a"]),
      onToggleTranscriptionModel: vi.fn(),
    },
    images: {
      model: "image-a",
      models: ["image-a", "image-b", "image-c"],
      editModels: ["image-a"],
      selectedModels: new Set(["image-a", "image-b"]),
      onModelChange: vi.fn(),
      onToggleComparisonModel: vi.fn(),
    },
    guardrails: {
      enabled: false,
      isRunning: false,
      activePolicies: [],
      error: "",
      onToggle: vi.fn(),
    },
    voice: {
      status: "idle",
      traditionalTranscriptionModels: ["stt-a", "stt-b"],
      traditionalTranscriptionModel: "stt-a",
      ttsModels: ["tts-a", "tts-b"],
      ttsModel: "tts-a",
      ttsVoice: "alloy",
      onTraditionalTranscriptionModelChange: vi.fn(),
      onTtsModelChange: vi.fn(),
      onTtsVoiceChange: vi.fn(),
    },
    ...overrides,
  };
}

describe("WorkspaceSidebar", () => {
  it("renders chat controls and handles conversation, settings, and guardrail actions", async () => {
    const user = userEvent.setup();
    const props = sidebarProps();
    render(<WorkspaceSidebar {...props} />);

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "MODEL-A",
    );
    await user.click(
      screen.getByRole("button", { name: "Previous Conversations" }),
    );
    await user.click(screen.getByTitle("Open model settings"));
    await user.click(
      screen.getByRole("button", { name: /side-by-side guardrails/i }),
    );
    const comparisonToggle = screen.getByRole("switch", {
      name: /enable comparison/i,
    });
    expect(comparisonToggle).toHaveAttribute("aria-checked", "false");
    await user.click(comparisonToggle);

    expect(props.workspace.onToggleConversations).toHaveBeenCalledOnce();
    expect(props.workspace.onEnableComparison).toHaveBeenCalledOnce();
    expect(props.models.onOpenSettings).toHaveBeenCalledWith("model-a");
    expect(props.guardrails.onToggle).toHaveBeenCalledOnce();
    expect(screen.getByText("Foundry connected")).toBeVisible();
  });

  it("renders document QA configuration and wires upload and remove", async () => {
    const user = userEvent.setup();
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        showDocumentControls: true,
      },
      documents: {
        ...sidebarProps().documents,
        documents: [document],
        message: { type: "success", text: "Indexed one document." },
      },
    });
    const { container } = render(<WorkspaceSidebar {...props} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected the document file input to render.");
    }

    const file = new File(["content"], "notes.txt", { type: "text/plain" });
    await user.upload(input, file);
    await user.click(
      screen.getByRole("button", { name: "Delete architecture.pdf" }),
    );

    expect(screen.getByRole("heading", { name: "Documents" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Indexed one document.",
    );
    expect(
      screen.getByRole("link", { name: "Open stored blob" }),
    ).toHaveAttribute("href", document.blob_url);
    expect(props.documents.onUpload).toHaveBeenCalledWith(input.files);
    expect(props.documents.onRemove).toHaveBeenCalledWith(document);
  });

  it("preserves empty and disabled document states", () => {
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        showDocumentControls: true,
        canUseProtectedApis: false,
        config: null,
      },
    });
    render(<WorkspaceSidebar {...props} />);

    expect(
      screen.getByRole("button", { name: "Upload documents" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Upload documents to ask grounded questions."),
    ).toBeVisible();
    expect(
      screen.getByText("Loading document RAG configuration..."),
    ).toBeVisible();
    expect(screen.getByTitle("Loading Foundry configuration...")).toBeVisible();
  });

  it("renders browser voice controls and wires supported actions and selectors", async () => {
    const user = userEvent.setup();
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        showBrowserVoiceControls: true,
      },
      browserSpeech: {
        ...sidebarProps().browserSpeech,
        availableSpeechVoices: [
          { voiceURI: "voice-a", name: "Ada", lang: "en-US" },
          { voiceURI: "voice-b", name: "Grace", lang: "en-GB" },
        ],
        selectedSpeechVoiceURI: "voice-a",
        speechRecognitionSupported: true,
        speechSynthesisSupported: true,
      },
    });
    render(<WorkspaceSidebar {...props} />);

    await user.click(
      screen.getByRole("button", { name: /browser dictation/i }),
    );
    await user.click(screen.getByRole("button", { name: /browser readback/i }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Text model for dictation" }),
      "model-b",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Readback voice" }),
      "voice-b",
    );

    expect(props.browserSpeech.onToggleDictation).toHaveBeenCalledOnce();
    expect(props.browserSpeech.onToggleReadback).toHaveBeenCalledOnce();
    expect(props.browserSpeech.onVoiceModelChange).toHaveBeenCalledWith(
      "model-b",
    );
    expect(props.browserSpeech.onSpeechVoiceChange).toHaveBeenCalledWith(
      "voice-b",
    );
  });

  it("renders image comparison and enforces the two-model limit", async () => {
    const user = userEvent.setup();
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "imageComparison",
        showImageComparisonControls: true,
      },
    });
    render(<WorkspaceSidebar {...props} />);

    expect(screen.getByText("Side-by-side images")).toBeVisible();
    expect(screen.getByRole("button", { name: "IMAGE-C" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "IMAGE-C" })).toHaveAttribute(
      "title",
      "You can compare up to two image models.",
    );
    await user.click(screen.getByRole("button", { name: "IMAGE-A" }));
    await user.click(
      screen.getByRole("button", { name: "Open settings for image-b" }),
    );

    expect(props.images.onToggleComparisonModel).toHaveBeenCalledWith(
      "image-a",
    );
    expect(props.models.onOpenSettings).toHaveBeenCalledWith("image-b");
  });

  it("renders text comparison and enabled guardrail policy details", async () => {
    const user = userEvent.setup();
    const comparisonProps = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "comparison",
        showComparisonControls: true,
      },
      comparison: {
        ...sidebarProps().comparison,
        selectedModels: new Set(["model-a", "model-b", "model-c"]),
        onToggleModel: vi.fn(),
      },
    });
    const { unmount } = render(<WorkspaceSidebar {...comparisonProps} />);

    expect(screen.getByText("Side-by-side")).toBeVisible();
    expect(screen.getByRole("button", { name: "MODEL-D" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "MODEL-A" }));
    expect(comparisonProps.comparison.onToggleModel).toHaveBeenCalledWith(
      "model-a",
    );
    unmount();

    const guardrailProps = sidebarProps({
      guardrails: {
        enabled: true,
        isRunning: true,
        activePolicies: [deploymentDefaultGuardrail, "Strict"],
        deploymentPolicyName: "Microsoft.DefaultV2",
        error: "Guardrail warning",
        onToggle: vi.fn(),
      },
    });
    render(<WorkspaceSidebar {...guardrailProps} />);

    expect(
      screen.getByText(/Microsoft\.DefaultV2.*deployment default/),
    ).toBeVisible();
    expect(screen.getByText("Guardrail 2: Strict")).toBeVisible();
    expect(screen.getByText("Guardrail warning")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /side-by-side guardrails/i }),
    ).toBeDisabled();
  });

  it("wires traditional voice pipeline and chat model selection", async () => {
    const user = userEvent.setup();
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "traditionalVoice",
      },
    });
    render(<WorkspaceSidebar {...props} />);

    const sttModel = screen.getByRole("combobox", { name: "STT model" });
    fireEvent.keyDown(sttModel, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "STT-B" }), {
      key: "Enter",
    });
    const chatModel = screen.getByRole("combobox", { name: "Chat model" });
    fireEvent.keyDown(chatModel, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "MODEL-B" }), {
      key: "Enter",
    });
    await user.click(screen.getByTitle("Open chat model settings"));

    expect(
      props.voice.onTraditionalTranscriptionModelChange,
    ).toHaveBeenCalledWith("stt-b");
    expect(props.models.onActiveModelChange).toHaveBeenCalledWith("model-b");
    expect(props.models.onOpenSettings).toHaveBeenCalledWith("model-a");
  });

  it("disables unavailable browser speech controls and exposes errors", () => {
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        showBrowserVoiceControls: true,
      },
      models: {
        ...sidebarProps().models,
        catalogModels: [],
        textModels: [],
      },
      browserSpeech: {
        ...sidebarProps().browserSpeech,
        voiceError: "Speech unavailable",
      },
    });
    render(<WorkspaceSidebar {...props} />);

    expect(
      screen.getByRole("button", { name: /browser dictation/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /browser readback/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Text model for dictation" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Speech unavailable");
  });

  it("places content extractor upload controls and gallery under previous conversations", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const onSelectSample = vi.fn();
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "contentExtractor",
      },
      contentExtractor: {
        ...sidebarProps().contentExtractor,
        samples: [
          {
            id: "generated-fox.png",
            name: "Generated fox",
            attribution: "Generated by Text to Image",
            source_url: "",
            image_url: "/api/images/samples/generated-fox.png",
          },
        ],
        onFileChange,
        onSelectSample,
      },
    });
    render(<WorkspaceSidebar {...props} />);

    const previousConversations = screen.getByRole("button", {
      name: "Previous Conversations",
    });
    const sourceType = screen.getByLabelText("Source type");

    expect(
      previousConversations.compareDocumentPosition(sourceType) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Extract content" })).toBeNull();
    expect(screen.getByText("Image Prompt gallery")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /generated fox/i }));
    expect(onSelectSample).toHaveBeenCalledWith(props.contentExtractor.samples[0]);

    await user.upload(
      screen.getByLabelText("Upload image for content extraction"),
      new File(["image"], "chart.png", { type: "image/png" }),
    );

    expect(onFileChange).toHaveBeenCalledWith(expect.any(File));
  });

  it("shows an empty content extractor gallery when storage has no images", () => {
    const props = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "contentExtractor",
      },
    });
    render(<WorkspaceSidebar {...props} />);

    expect(screen.getByText("Image Prompt gallery")).toBeVisible();
    expect(screen.getByText(/No gallery images yet/)).toBeVisible();
  });

  it("keeps recorded transcription model selection but hides fake translation model controls", async () => {
    const transcriptionProps = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "transcribe",
      },
    });
    const transcriptionRender = render(
      <WorkspaceSidebar {...transcriptionProps} />,
    );

    const transcriptionModel = screen.getByRole("combobox", { name: "Model" });
    fireEvent.keyDown(transcriptionModel, { key: "ArrowDown" });
    fireEvent.keyDown(
      await screen.findByRole("option", { name: "TRANSCRIBE-B" }),
      {
        key: "Enter",
      },
    );
    expect(
      transcriptionProps.models.onTranscriptionModelChange,
    ).toHaveBeenCalledWith("transcribe-b");
    transcriptionRender.unmount();

    const gptWebRtcProps = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "realtimeTranslationWebRtc",
      },
    });
    const gptWebRtcRender = render(<WorkspaceSidebar {...gptWebRtcProps} />);
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
    expect(screen.getByText("GPT Realtime Translation webrtc")).toBeVisible();
    expect(
      screen.getByText(/browser WebRTC directly to Foundry/i),
    ).toBeVisible();
    gptWebRtcRender.unmount();

    const gptProps = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "realtimeTranslationWebSocket",
      },
    });
    const gptRender = render(<WorkspaceSidebar {...gptProps} />);
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
    expect(
      screen.getByText("GPT Realtime Translation websockets"),
    ).toBeVisible();
    expect(screen.getByText(/backend WebSocket proxy/i)).toBeVisible();
    gptRender.unmount();

    const speechProps = sidebarProps({
      workspace: {
        ...sidebarProps().workspace,
        workspace: "liveTranslation",
      },
    });
    render(<WorkspaceSidebar {...speechProps} />);
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
    expect(screen.getByText("Azure Speech Live Translation")).toBeVisible();
    expect(screen.queryByLabelText("Voice mode")).toBeNull();
  });
});
