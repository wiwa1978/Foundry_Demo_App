import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredMessage } from "@/features/textChat/types";
import type {
  BrowserSpeechRecognition,
  BrowserSpeechRecognitionEvent,
} from "@/features/voice/types";

import { useBrowserSpeech } from "./useBrowserSpeech";

class MockSpeechRecognition implements BrowserSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  emitResult(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: {
        0: { 0: { transcript }, isFinal: true },
        length: 1,
      },
    });
  }
}

class ThrowingSpeechRecognition extends MockSpeechRecognition {
  start = vi.fn(() => {
    throw new Error("already started");
  });
}

class MockUtterance {
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;

  constructor(readonly text: string) {}
}

const response: StoredMessage = {
  id: "assistant-1",
  conversation_id: "conversation-1",
  role: "assistant",
  content: "Hello from Foundry",
  model: "voice-model",
  api_surface: "responses",
  duration_ms: 10,
  usage: null,
  error: null,
  guardrail_variant: null,
  guardrail_policy_name: null,
  guardrail_results: null,
  created_at: "2026-08-07T10:00:00Z",
};

describe("useBrowserSpeech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    MockSpeechRecognition.instances = [];
  });

  it("dictates, reads responses, persists settings, and cleans up resources", () => {
    const voice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "Test voice",
      voiceURI: "test-voice",
    } as SpeechSynthesisVoice;
    const voiceEvents = new EventTarget();
    const speechSynthesis = {
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) =>
          voiceEvents.addEventListener(type, listener),
      ),
      removeEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) =>
          voiceEvents.removeEventListener(type, listener),
      ),
      getVoices: vi.fn(() => [voice]),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    localStorage.setItem("foundry-chat-voice-readback", "true");
    const setActiveModel = vi.fn();
    let prompt = "Existing";
    const setPrompt = vi.fn((update: React.SetStateAction<string>) => {
      prompt = typeof update === "function" ? update(prompt) : update;
    });
    const { result, unmount } = renderHook(() =>
      useBrowserSpeech({
        models: ["voice-model"],
        comparisonMode: false,
        setActiveModel,
        setPrompt,
      }),
    );

    expect(result.current.speechRecognitionSupported).toBe(true);
    expect(result.current.speechSynthesisSupported).toBe(true);
    expect(result.current.selectedSpeechVoiceURI).toBe("test-voice");
    act(() => result.current.toggleDictation());
    const recognition = MockSpeechRecognition.instances[0];
    expect(setActiveModel).toHaveBeenCalledWith("voice-model");
    expect(recognition.start).toHaveBeenCalledOnce();
    act(() => recognition.emitResult(" dictated words "));
    expect(prompt).toBe("Existing dictated words");

    act(() => result.current.speakResponses([response]));
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utterance = speechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("voice-model. Hello from Foundry");
    expect(utterance.voice).toBe(voice);

    act(() => result.current.toggleDictation());
    act(() => recognition.emitResult(" dictated words finalized on stop"));
    expect(prompt).toBe("Existing dictated words finalized on stop");
    expect(recognition.stop).toHaveBeenCalledOnce();
    act(() => recognition.onend?.());
    act(() => result.current.toggleReadback());
    expect(localStorage.getItem("foundry-chat-voice-readback")).toBe("false");

    act(() => result.current.toggleDictation());
    const activeRecognition = MockSpeechRecognition.instances[1];
    unmount();
    expect(activeRecognition.abort).toHaveBeenCalledOnce();
    expect(speechSynthesis.removeEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function),
    );
    expect(speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("reports unsupported dictation and recognition failures", () => {
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    const setActiveModel = vi.fn();
    const setPrompt = vi.fn();
    const unsupported = renderHook(() =>
      useBrowserSpeech({
        models: [],
        comparisonMode: false,
        setActiveModel,
        setPrompt,
      }),
    );
    act(() => unsupported.result.current.toggleDictation());
    expect(unsupported.result.current.voiceError).toBe(
      "Voice dictation is not supported in this browser.",
    );
    expect(unsupported.result.current.speechSynthesisSupported).toBe(false);
    unsupported.unmount();

    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    const supported = renderHook(() =>
      useBrowserSpeech({
        models: ["voice-model"],
        comparisonMode: true,
        setActiveModel,
        setPrompt,
      }),
    );
    act(() => supported.result.current.toggleDictation());
    const recognition = MockSpeechRecognition.instances[0];
    expect(setActiveModel).not.toHaveBeenCalled();
    act(() => recognition.onerror?.());
    expect(supported.result.current.voiceError).toBe(
      "Voice dictation stopped. Check microphone permissions.",
    );
    expect(supported.result.current.isListening).toBe(false);
  });

  it("handles recognition start conflicts and model changes", () => {
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: ThrowingSpeechRecognition,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    const setActiveModel = vi.fn();
    const { result } = renderHook(() =>
      useBrowserSpeech({
        models: ["voice-model", "next-model"],
        comparisonMode: false,
        setActiveModel,
        setPrompt: vi.fn(),
      }),
    );
    act(() => result.current.changeVoiceModel("next-model"));
    expect(setActiveModel).toHaveBeenCalledWith("next-model");

    act(() => result.current.toggleDictation());
    expect(result.current.voiceError).toBe(
      "Voice dictation is already starting. Try again in a moment.",
    );
    expect(MockSpeechRecognition.instances[0].abort).toHaveBeenCalledOnce();
  });

  it("renders interim speech without duplicating final results", () => {
    const speechSynthesis = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getVoices: vi.fn(() => []),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    localStorage.setItem("foundry-chat-voice-readback", "true");
    let prompt = "";
    const setPrompt = vi.fn((update: React.SetStateAction<string>) => {
      prompt = typeof update === "function" ? update(prompt) : update;
    });
    const { result } = renderHook(() =>
      useBrowserSpeech({
        models: [],
        comparisonMode: false,
        setActiveModel: vi.fn(),
        setPrompt,
      }),
    );

    act(() => result.current.toggleDictation());
    const recognition = MockSpeechRecognition.instances[0];
    act(() =>
      recognition.onresult?.({
        resultIndex: 0,
        results: {
          0: { 0: { transcript: "interim" }, isFinal: false },
          length: 1,
        },
      }),
    );
    expect(prompt).toBe("interim");
    act(() => recognition.emitResult("final words"));
    expect(prompt).toBe("final words");

    act(() =>
      recognition.onresult?.({
        resultIndex: 1,
        results: {
          0: { 0: { transcript: "final words" }, isFinal: true },
          1: { 0: { transcript: " continue" }, isFinal: false },
          length: 2,
        },
      }),
    );
    expect(prompt).toBe("final words continue");

    act(() =>
      result.current.speakResponses([
        { ...response, error: "failed" },
        { ...response, id: "empty", content: "" },
        { ...response, id: "plain", model: null },
      ]),
    );
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect((speechSynthesis.speak.mock.calls[0][0] as MockUtterance).text).toBe(
      "Hello from Foundry",
    );
    act(() => recognition.onend?.());
    expect(result.current.isListening).toBe(false);
  });
});
