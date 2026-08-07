import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  ColorPalette,
  ModelModality,
  ModelSettings,
} from "@/app/workspace/contracts";
import type { ChatMessage } from "@/features/textChat/types";
import type { TraditionalVoiceRequest } from "@/features/voice/useTraditionalVoiceSession";

import {
  WorkspaceContentRouter,
  type WorkspaceContentRouterProps,
  type WorkspaceContentRoute,
} from "./WorkspaceContentRouter";

type ActionProps = {
  onSubmit?: () => void;
  onGenerate?: () => void;
  onOpenSettings?: (model: string) => void;
  onModelChange?: (currentModel: string, nextModel: string) => void;
};

type ComposerProps = {
  ariaLabel: string;
  leftControls?: ReactNode;
  rightControls?: ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type ComposerSelectProps = {
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

vi.mock("@/app/workspace/AppSettingsPage", () => ({
  AppSettingsPage: (props: {
    onAddModel: () => void;
    onOpenAdmin: () => void;
    onColorPaletteChange: (palette: ColorPalette) => void;
  }) => (
    <div data-testid="app-settings">
      <button type="button" onClick={props.onAddModel}>
        Add model
      </button>
      <button type="button" onClick={props.onOpenAdmin}>
        Open admin
      </button>
      <button type="button" onClick={() => props.onColorPaletteChange("ocean")}>
        Ocean palette
      </button>
    </div>
  ),
}));

vi.mock("@/app/workspace/ModelMetricsDashboard", () => ({
  ModelMetricsDashboard: (props: {
    onModelChange: (model: string) => void;
    onDaysChange: (days: number) => void;
    onRefresh: () => void;
  }) => (
    <div data-testid="metrics">
      <button type="button" onClick={() => props.onModelChange("model-b")}>
        Filter model
      </button>
      <button type="button" onClick={() => props.onDaysChange(30)}>
        30 days
      </button>
      <button type="button" onClick={props.onRefresh}>
        Refresh metrics
      </button>
    </div>
  ),
}));

vi.mock("@/app/workspace/ModelSettingsPage", () => ({
  ModelSettingsPage: (props: {
    model: string;
    onClose: () => void;
    onSave: () => void;
    onReset: () => void;
    onChange: (patch: Partial<ModelSettings>) => void;
  }) => (
    <div data-testid="model-settings">
      <span>{props.model}</span>
      <button type="button" onClick={props.onClose}>
        Close settings
      </button>
      <button type="button" onClick={props.onSave}>
        Save settings
      </button>
      <button
        type="button"
        onClick={() => props.onChange({ temperature: 0.2 })}
      >
        Change settings
      </button>
      <button type="button" onClick={props.onReset}>
        Reset settings
      </button>
    </div>
  ),
}));

vi.mock("@/app/workspace/WorkspacePrimitives", () => ({
  ChatEmptyState: ({ onOpenUseCases }: { onOpenUseCases: () => void }) => (
    <button type="button" onClick={onOpenUseCases}>
      Empty chat
    </button>
  ),
  ComposerSelect: ({ ariaLabel, options, onChange }: ComposerSelectProps) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onChange(options.at(-1)?.value ?? "")}
    >
      {ariaLabel}
    </button>
  ),
  UseCaseComposer: ({
    ariaLabel,
    leftControls,
    rightControls,
    onChange,
    onSubmit,
  }: ComposerProps) => (
    <div data-testid="composer">
      {leftControls}
      {rightControls}
      <button type="button" onClick={() => onChange("changed prompt")}>
        Change prompt
      </button>
      <button
        type="button"
        aria-label={`Submit ${ariaLabel}`}
        onClick={onSubmit}
      >
        Submit
      </button>
    </div>
  ),
}));

vi.mock("@/features/comparison/ComparisonWorkspace", () => ({
  ComparisonWorkspace: (props: ActionProps) => (
    <div data-testid="comparison">
      <button type="button" onClick={props.onSubmit}>
        Submit comparison
      </button>
      <button
        type="button"
        onClick={() => props.onModelChange?.("model-a", "model-b")}
      >
        Replace comparison model
      </button>
    </div>
  ),
}));

vi.mock("@/features/guardrails/GuardrailWorkspaces", () => ({
  GuardrailComparisonWorkspace: (props: {
    onSubmit: () => void;
    onOpenSettings: () => void;
  }) => (
    <div data-testid="guardrail-chat">
      <button type="button" onClick={props.onSubmit}>
        Submit guardrail
      </button>
      <button type="button" onClick={props.onOpenSettings}>
        Guardrail settings
      </button>
    </div>
  ),
}));

vi.mock("@/features/images/ImageWorkspaces", () => ({
  TextToImageWorkspace: (props: ActionProps) => (
    <button type="button" data-testid="image" onClick={props.onGenerate}>
      Generate image
    </button>
  ),
  ImageToImageWorkspace: (props: ActionProps) => (
    <button type="button" data-testid="image-edit" onClick={props.onGenerate}>
      Edit image
    </button>
  ),
  ImageComparisonWorkspace: (props: ActionProps) => (
    <div data-testid="image-comparison">
      <button type="button" onClick={props.onGenerate}>
        Compare images
      </button>
      <button type="button" onClick={() => props.onOpenSettings?.("image-a")}>
        Image settings
      </button>
      <button
        type="button"
        onClick={() => props.onModelChange?.("image-a", "image-b")}
      >
        Replace image model
      </button>
    </div>
  ),
}));

vi.mock("@/features/textChat/ChatMessages", () => ({
  ChatMessageHistory: ({ messages }: { messages: ChatMessage[] }) => (
    <div data-testid="chat-history">{messages.length}</div>
  ),
}));

vi.mock("@/features/voice/VoiceWorkspaces", () => ({
  TraditionalVoiceWorkspace: (props: {
    onStart: () => void;
    onStop: () => void;
  }) => (
    <div data-testid="traditional-voice">
      <button type="button" onClick={props.onStart}>
        Start traditional
      </button>
      <button type="button" onClick={props.onStop}>
        Stop traditional
      </button>
    </div>
  ),
  TranscriptionWorkspace: (props: {
    onStart: () => void;
    onStop: () => void;
    onFileSelected: (file: File | undefined) => void;
  }) => (
    <div data-testid="transcription">
      <button type="button" onClick={props.onStart}>
        Start transcription
      </button>
      <button type="button" onClick={props.onStop}>
        Stop transcription
      </button>
      <button
        type="button"
        onClick={() => props.onFileSelected(new File([], "voice.wav"))}
      >
        Select audio
      </button>
    </div>
  ),
  RealtimeVoiceHero: (props: { onStart: () => void }) => (
    <button type="button" data-testid="realtime" onClick={props.onStart}>
      Start realtime
    </button>
  ),
  VoiceLiveHero: (props: { onStart: () => void }) => (
    <button type="button" data-testid="voice-live" onClick={props.onStart}>
      Start voice live
    </button>
  ),
  LiveTranslationHero: (props: {
    onStart: () => void;
    onTargetLanguageChange: (language: string) => void;
  }) => (
    <div data-testid="live-translation">
      <button type="button" onClick={props.onStart}>
        Start translation
      </button>
      <button type="button" onClick={() => props.onTargetLanguageChange("fr")}>
        French
      </button>
    </div>
  ),
}));

const modelSettings: ModelSettings = {
  model: "model-a",
  api_surface: "responses",
  modalities: ["text"],
  system_prompt: "Be useful",
  temperature: 0.7,
  top_p: 1,
  max_tokens: 512,
  repetition_penalty: 1,
  guardrail_policy_names: ["default", "strict"],
};

function routerProps(
  overrides: Partial<WorkspaceContentRouterProps> = {},
): WorkspaceContentRouterProps {
  const traditionalRequest: TraditionalVoiceRequest = {
    models: ["model-a", "model-b"],
    prompt: "voice prompt",
    activeModel: "model-a",
    conversation: null,
    conversationId: null,
    useCase: "traditional_voice",
    reasoningEffort: "default",
    guardrails: { comparisonEnabled: false, policies: ["default", "strict"] },
    transcriptionModel: "stt-a",
    tts: { model: "tts-a", voice: "alloy" },
  };
  const props: WorkspaceContentRouterProps = {
    route: {
      view: "chat",
      workspace: "chat",
      useCase: "text_chat",
      enableComposerDictation: true,
    },
    access: {
      locked: false,
      checking: false,
      canUseProtectedApis: true,
      onSignIn: vi.fn(),
    },
    metrics: {
      models: ["model-a", "model-b"],
      metrics: null,
      model: "",
      days: 7,
      loading: false,
      error: "",
      setModel: vi.fn(),
      setDays: vi.fn(),
      refresh: vi.fn(async () => undefined),
    },
    settings: {
      app: {
        models: ["model-a"],
        modelModalities: { "model-a": ["text"] as ModelModality[] },
        newModel: "",
        message: null,
        colorPalette: "foundry",
        canManageModels: true,
        onNewModelChange: vi.fn(),
        onAddModel: vi.fn(),
        onOpenAdmin: vi.fn(),
        onSaveCapabilities: vi.fn(async () => undefined),
        onColorPaletteChange: vi.fn(),
      },
      model: {
        settingsModel: "model-a",
        draft: modelSettings,
        saving: false,
        policies: [],
        deploymentPolicy: null,
        policiesLoading: false,
        error: "",
        onClose: vi.fn(),
        save: vi.fn(async () => undefined),
        resetDraft: vi.fn(),
        changeDraft: vi.fn(),
      },
    },
    images: {
      model: "image-a",
      models: ["image-a", "image-b"],
      editModels: ["image-a"],
      selected: ["image-a", "image-b"],
      prompt: "an image",
      size: "1024x1024",
      result: null,
      generating: false,
      error: "",
      editSource: null,
      editResult: null,
      editGenerating: false,
      editError: "",
      comparisonResults: {},
      comparisonErrors: {},
      comparisonGenerating: false,
      setPrompt: vi.fn(),
      setSize: vi.fn(),
      setEditSource: vi.fn(),
      setModel: vi.fn(),
      runGeneration: vi.fn(async () => undefined),
      runEdit: vi.fn(async () => undefined),
      runComparison: vi.fn(async () => undefined),
      onOpenSettings: vi.fn(),
      replaceComparisonModel: vi.fn(),
    },
    comparison: {
      allModels: ["model-a", "model-b"],
      models: ["model-a"],
      messages: [],
      prompt: "compare",
      isRunning: false,
      canSubmit: true,
      onPromptChange: vi.fn(),
      onSubmit: vi.fn(),
      onToggleDictation: vi.fn(),
      onOpenSettings: vi.fn(),
      onModelChange: vi.fn(),
    },
    traditionalVoice: {
      configured: true,
      activeModel: "model-a",
      chatModels: ["model-a"],
      transcriptionModels: ["stt-a"],
      transcriptionModel: "stt-a",
      ttsModels: ["tts-a"],
      ttsModel: "tts-a",
      ttsVoice: "alloy",
      ttsVoices: ["alloy"],
      status: "idle",
      error: "",
      result: null,
      request: traditionalRequest,
      onChatModelChange: vi.fn(),
      onTranscriptionModelChange: vi.fn(),
      onTtsModelChange: vi.fn(),
      onTtsVoiceChange: vi.fn(),
      onStart: vi.fn(),
      onStop: vi.fn(),
    },
    transcription: {
      configured: true,
      model: "stt-a",
      status: "idle",
      error: "",
      result: null,
      language: "en-US",
      sourceName: "",
      audioUrl: "",
      fileInputRef: createRef<HTMLInputElement>(),
      onLanguageChange: vi.fn(),
      onStart: vi.fn(),
      onStop: vi.fn(),
      onFileSelected: vi.fn(),
    },
    realtime: {
      session: {
        configured: true,
        model: "realtime-a",
        status: "idle",
        error: "",
        guardrailStatus: "",
        transcript: [],
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
      voiceLive: {
        configured: true,
        model: "voice-live-a",
        voice: "ava",
        status: "idle",
        error: "",
        transcript: [],
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
      liveTranslation: {
        configured: true,
        status: "idle",
        error: "",
        targetLanguage: "en",
        transcript: [],
        onTargetLanguageChange: vi.fn(),
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
    },
    guardrails: {
      enabled: false,
      policyNames: ["default", "strict"],
      deploymentPolicyName: "default",
    },
    chat: {
      activeModel: "model-a",
      models: ["model-a", "model-b"],
      messages: [],
      prompt: "hello",
      isRunning: false,
      canSubmit: true,
      isListening: false,
      speechRecognitionSupported: true,
      reasoningEffort: "default",
      onPromptChange: vi.fn(),
      onSubmit: vi.fn(),
      onDocumentSubmit: vi.fn(),
      onOpenSettings: vi.fn(),
      onActiveModelChange: vi.fn(),
      onToggleDictation: vi.fn(),
      onReasoningEffortChange: vi.fn(),
      onOpenUseCases: vi.fn(),
    },
  };
  return { ...props, ...overrides };
}

function route(
  props: WorkspaceContentRouterProps,
  update: Partial<WorkspaceContentRoute>,
): WorkspaceContentRouterProps {
  return { ...props, route: { ...props.route, ...update } };
}

describe("WorkspaceContentRouter", () => {
  it("renders access checking and sign-in states", async () => {
    const user = userEvent.setup();
    const props = routerProps();
    const { rerender } = render(
      <WorkspaceContentRouter
        {...props}
        access={{ ...props.access, locked: true, checking: true }}
      />,
    );

    expect(screen.getByText("Checking access...")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Sign in with Microsoft" }),
    ).not.toBeInTheDocument();

    rerender(
      <WorkspaceContentRouter
        {...props}
        access={{ ...props.access, locked: true, checking: false }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Sign in with Microsoft" }),
    );
    expect(props.access.onSignIn).toHaveBeenCalledOnce();
  });

  it("selects metrics, app settings, and model settings with their callbacks", async () => {
    const user = userEvent.setup();
    const props = routerProps();
    const { rerender } = render(
      <WorkspaceContentRouter {...route(props, { view: "metrics" })} />,
    );

    expect(screen.getByTestId("metrics")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Filter model" }));
    await user.click(screen.getByRole("button", { name: "30 days" }));
    await user.click(screen.getByRole("button", { name: "Refresh metrics" }));
    expect(props.metrics.setModel).toHaveBeenCalledWith("model-b");
    expect(props.metrics.setDays).toHaveBeenCalledWith(30);
    expect(props.metrics.refresh).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceContentRouter {...route(props, { view: "settings" })} />,
    );
    await user.click(screen.getByRole("button", { name: "Add model" }));
    await user.click(screen.getByRole("button", { name: "Open admin" }));
    await user.click(screen.getByRole("button", { name: "Ocean palette" }));
    expect(props.settings.app.onAddModel).toHaveBeenCalledOnce();
    expect(props.settings.app.onOpenAdmin).toHaveBeenCalledOnce();
    expect(props.settings.app.onColorPaletteChange).toHaveBeenCalledWith(
      "ocean",
    );

    rerender(
      <WorkspaceContentRouter {...route(props, { view: "model-settings" })} />,
    );
    expect(screen.getByTestId("model-settings")).toHaveTextContent("model-a");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await user.click(screen.getByRole("button", { name: "Change settings" }));
    await user.click(screen.getByRole("button", { name: "Reset settings" }));
    await user.click(screen.getByRole("button", { name: "Close settings" }));
    expect(props.settings.model.save).toHaveBeenCalledOnce();
    expect(props.settings.model.changeDraft).toHaveBeenCalledWith({
      temperature: 0.2,
    });
    expect(props.settings.model.resetDraft).toHaveBeenCalledOnce();
    expect(props.settings.model.onClose).toHaveBeenCalledOnce();
  });

  it("selects image generation, editing, and comparison routes", async () => {
    const user = userEvent.setup();
    const props = routerProps();
    const { rerender } = render(
      <WorkspaceContentRouter {...route(props, { workspace: "image" })} />,
    );

    await user.click(screen.getByTestId("image"));
    expect(props.images.runGeneration).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceContentRouter {...route(props, { workspace: "imageEdit" })} />,
    );
    await user.click(screen.getByTestId("image-edit"));
    expect(props.images.runEdit).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceContentRouter
        {...route(props, { workspace: "imageComparison" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Compare images" }));
    await user.click(screen.getByRole("button", { name: "Image settings" }));
    await user.click(
      screen.getByRole("button", { name: "Replace image model" }),
    );
    expect(props.images.runComparison).toHaveBeenCalledOnce();
    expect(props.images.onOpenSettings).toHaveBeenCalledWith("image-a");
    expect(props.images.replaceComparisonModel).toHaveBeenCalledWith(
      "image-a",
      "image-b",
    );
  });

  it("selects traditional, transcription, and all realtime routes", async () => {
    const user = userEvent.setup();
    const props = routerProps();
    const { rerender } = render(
      <WorkspaceContentRouter
        {...route(props, { workspace: "traditionalVoice" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start traditional" }));
    expect(props.traditionalVoice.onStart).toHaveBeenCalledWith(
      props.traditionalVoice.request,
    );

    rerender(
      <WorkspaceContentRouter {...route(props, { workspace: "transcribe" })} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Start transcription" }),
    );
    await user.click(screen.getByRole("button", { name: "Select audio" }));
    expect(props.transcription.onStart).toHaveBeenCalledOnce();
    expect(props.transcription.onFileSelected).toHaveBeenCalledWith(
      expect.objectContaining({ name: "voice.wav" }),
    );

    rerender(
      <WorkspaceContentRouter
        {...route(props, { workspace: "realtimeVoice" })}
      />,
    );
    await user.click(screen.getByTestId("realtime"));
    expect(props.realtime.session.onStart).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceContentRouter {...route(props, { workspace: "voiceLive" })} />,
    );
    await user.click(screen.getByTestId("voice-live"));
    expect(props.realtime.voiceLive.onStart).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceContentRouter
        {...route(props, { workspace: "liveTranslation" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "French" }));
    await user.click(screen.getByRole("button", { name: "Start translation" }));
    expect(
      props.realtime.liveTranslation.onTargetLanguageChange,
    ).toHaveBeenCalledWith("fr");
    expect(props.realtime.liveTranslation.onStart).toHaveBeenCalledOnce();
  });

  it("routes guardrail chat and default document composer callbacks", async () => {
    const user = userEvent.setup();
    const props = routerProps({
      guardrails: {
        enabled: true,
        policyNames: ["default", "strict"],
        deploymentPolicyName: "default",
      },
    });
    const { rerender } = render(<WorkspaceContentRouter {...props} />);

    expect(screen.getByTestId("guardrail-chat")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit guardrail" }));
    await user.click(
      screen.getByRole("button", { name: "Guardrail settings" }),
    );
    expect(props.chat.onSubmit).toHaveBeenCalledOnce();
    expect(props.chat.onOpenSettings).toHaveBeenCalledWith("model-a");

    const documentProps = routerProps({
      route: {
        ...props.route,
        useCase: "document_qa",
      },
    });
    rerender(<WorkspaceContentRouter {...documentProps} />);
    expect(screen.getByText("Document RAG")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Submit Chat prompt" }),
    );
    await user.click(screen.getByRole("button", { name: "Change prompt" }));
    await user.click(screen.getByRole("button", { name: "Composer model" }));
    await user.click(screen.getByTitle("Open active model settings"));
    await user.click(screen.getByTitle(/Start browser dictation/));
    await user.click(screen.getByRole("button", { name: "Reasoning level" }));

    expect(documentProps.chat.onDocumentSubmit).toHaveBeenCalledOnce();
    expect(documentProps.chat.onPromptChange).toHaveBeenCalledWith(
      "changed prompt",
    );
    expect(documentProps.chat.onActiveModelChange).toHaveBeenCalledWith(
      "model-b",
    );
    expect(documentProps.chat.onOpenSettings).toHaveBeenCalledWith("model-a");
    expect(documentProps.chat.onToggleDictation).toHaveBeenCalledOnce();
    expect(documentProps.chat.onReasoningEffortChange).toHaveBeenCalledWith(
      "xhigh",
    );
  });

  it("routes comparison submit and model replacement callbacks", async () => {
    const user = userEvent.setup();
    const props = routerProps();
    render(
      <WorkspaceContentRouter {...route(props, { workspace: "comparison" })} />,
    );

    expect(screen.getByTestId("comparison")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit comparison" }));
    await user.click(
      screen.getByRole("button", { name: "Replace comparison model" }),
    );
    expect(props.comparison.onSubmit).toHaveBeenCalledOnce();
    expect(props.comparison.onModelChange).toHaveBeenCalledWith(
      "model-a",
      "model-b",
    );
  });
});
