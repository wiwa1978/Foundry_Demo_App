import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  speechVoiceStorageKey,
  voiceModelStorageKey,
  voiceReadbackStorageKey,
} from "@/app/workspace/constants";
import type { StoredMessage } from "@/features/textChat/types";
import type { BrowserSpeechRecognition } from "@/features/voice/types";
import { readStorage, writeStorage } from "@/lib/storage";

export type BrowserSpeechOptions = {
  models: string[];
  comparisonMode: boolean;
  setActiveModel: Dispatch<SetStateAction<string>>;
  setPrompt: Dispatch<SetStateAction<string>>;
};

export function useBrowserSpeech({
  models,
  comparisonMode,
  setActiveModel,
  setPrompt,
}: BrowserSpeechOptions) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const renderedTranscriptRef = useRef("");
  const mountedRef = useRef(true);
  const recognitionGenerationRef = useRef(0);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] =
    useState(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] =
    useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceReadbackEnabled, setVoiceReadbackEnabled] = useState(
    () => readStorage(voiceReadbackStorageKey) === "true",
  );
  const [selectedVoiceModel, setSelectedVoiceModel] = useState(() =>
    readStorage(voiceModelStorageKey),
  );
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [selectedSpeechVoiceURI, setSelectedSpeechVoiceURI] = useState(() =>
    readStorage(speechVoiceStorageKey),
  );

  function isCurrentRecognition(generation: number) {
    return (
      mountedRef.current && recognitionGenerationRef.current === generation
    );
  }

  function stopDictation() {
    recognitionGenerationRef.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    renderedTranscriptRef.current = "";
    recognition?.stop();
    if (mountedRef.current) setIsListening(false);
  }

  function toggleDictation() {
    if (isListening) {
      // SpeechRecognition commonly emits its final result only after stop().
      // Keep this generation active until onend so that result is not lost.
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice dictation is not supported in this browser.");
      return;
    }

    setVoiceError("");
    const generation = recognitionGenerationRef.current + 1;
    recognitionGenerationRef.current = generation;
    const recognition = new SpeechRecognition();
    renderedTranscriptRef.current = "";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      if (!isCurrentRecognition(generation)) return;
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      setPrompt((current) => {
        const previousTranscript = renderedTranscriptRef.current;
        const promptWithoutPrevious =
          previousTranscript && current.endsWith(previousTranscript)
            ? current.slice(0, -previousTranscript.length).trimEnd()
            : current;
        const spacer =
          promptWithoutPrevious && !promptWithoutPrevious.endsWith(" ")
            ? " "
            : "";
        renderedTranscriptRef.current = transcript;
        return `${promptWithoutPrevious}${spacer}${transcript}`;
      });
    };
    recognition.onerror = () => {
      if (!isCurrentRecognition(generation)) return;
      recognitionGenerationRef.current += 1;
      recognitionRef.current = null;
      renderedTranscriptRef.current = "";
      setVoiceError("Voice dictation stopped. Check microphone permissions.");
      setIsListening(false);
    };
    recognition.onend = () => {
      if (!isCurrentRecognition(generation)) return;
      recognitionGenerationRef.current += 1;
      recognitionRef.current = null;
      renderedTranscriptRef.current = "";
      setIsListening(false);
    };
    recognitionRef.current = recognition;

    try {
      if (selectedVoiceModel && !comparisonMode) {
        setActiveModel(selectedVoiceModel);
      }
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionGenerationRef.current += 1;
      recognitionRef.current = null;
      recognition.abort();
      setVoiceError(
        "Voice dictation is already starting. Try again in a moment.",
      );
    }
  }

  function toggleReadback() {
    setVoiceReadbackEnabled((enabled) => !enabled);
  }

  function changeVoiceModel(model: string) {
    setSelectedVoiceModel(model);
    if (!comparisonMode) setActiveModel(model);
  }

  function speakResponses(responses: StoredMessage[]) {
    if (!voiceReadbackEnabled || !speechSynthesisSupported) return;
    const selectedSpeechVoice = availableSpeechVoices.find(
      (voice) => voice.voiceURI === selectedSpeechVoiceURI,
    );
    window.speechSynthesis.cancel();
    for (const response of responses) {
      if (response.error || !response.content.trim()) continue;
      const prefix = response.model ? `${response.model}. ` : "";
      const utterance = new SpeechSynthesisUtterance(
        `${prefix}${response.content}`,
      );
      if (selectedSpeechVoice) utterance.voice = selectedSpeechVoice;
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechRecognitionSupported(Boolean(SpeechRecognition));

    let cleanupSpeechVoices: (() => void) | undefined;
    if (window.speechSynthesis) {
      const refreshSpeechVoices = () => {
        if (!mountedRef.current) return;
        const voices = window.speechSynthesis.getVoices();
        setAvailableSpeechVoices(voices);
        setSelectedSpeechVoiceURI((current) => {
          if (current && voices.some((voice) => voice.voiceURI === current)) {
            return current;
          }
          return (
            voices.find((voice) => voice.default)?.voiceURI ??
            voices[0]?.voiceURI ??
            ""
          );
        });
      };
      setSpeechSynthesisSupported(true);
      refreshSpeechVoices();
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        refreshSpeechVoices,
      );
      cleanupSpeechVoices = () =>
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          refreshSpeechVoices,
        );
    } else {
      setSpeechSynthesisSupported(false);
      setAvailableSpeechVoices([]);
    }

    return () => {
      mountedRef.current = false;
      recognitionGenerationRef.current += 1;
      cleanupSpeechVoices?.();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    writeStorage(voiceReadbackStorageKey, String(voiceReadbackEnabled));
    if (!voiceReadbackEnabled) window.speechSynthesis?.cancel();
  }, [voiceReadbackEnabled]);

  useEffect(() => {
    writeStorage(
      voiceModelStorageKey,
      selectedVoiceModel ? selectedVoiceModel : null,
    );
  }, [selectedVoiceModel]);

  useEffect(() => {
    writeStorage(
      speechVoiceStorageKey,
      selectedSpeechVoiceURI ? selectedSpeechVoiceURI : null,
    );
  }, [selectedSpeechVoiceURI]);

  useEffect(() => {
    setSelectedVoiceModel((current) =>
      current && models.includes(current) ? current : (models[0] ?? ""),
    );
  }, [models]);

  return {
    availableSpeechVoices,
    changeVoiceModel,
    isListening,
    selectedSpeechVoiceURI,
    selectedVoiceModel,
    setSelectedSpeechVoiceURI,
    speakResponses,
    speechRecognitionSupported,
    speechSynthesisSupported,
    stopDictation,
    toggleDictation,
    toggleReadback,
    voiceError,
    voiceReadbackEnabled,
  };
}
