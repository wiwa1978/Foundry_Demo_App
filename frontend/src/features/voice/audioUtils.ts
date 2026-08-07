import type { TraditionalVoiceResult } from "@/app/workspace/contracts";

export async function convertAudioToWav(source: Blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    const targetRate = 16000;
    const frameCount = Math.ceil(decoded.duration * targetRate);
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const monoData = mono.getChannelData(0);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < channelData.length; index += 1) {
        monoData[index] += channelData[index] / decoded.numberOfChannels;
      }
    }
    const sourceNode = offline.createBufferSource();
    sourceNode.buffer = mono;
    sourceNode.connect(offline.destination);
    sourceNode.start();
    const rendered = await offline.startRendering();
    return encodePcmWav(rendered.getChannelData(0), targetRate);
  } finally {
    void context.close();
  }
}

export function encodePcmWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function summarizeTraditionalVoiceResult(
  result: TraditionalVoiceResult,
) {
  return {
    model: result.model,
    transcription: {
      model: result.transcription.model,
      text: result.transcription.text,
      duration_ms: result.transcription.duration_ms,
    },
    results: result.results.map((variant) => ({
      model: variant.model,
      guardrail_variant: variant.guardrail_variant,
      guardrail_policy_name: variant.guardrail_policy_name,
      api_surface: variant.api_surface,
      content: variant.content,
      error: variant.error,
      duration_ms: variant.duration_ms,
      usage: variant.usage,
      speech: variant.speech
        ? {
            model: variant.speech.model,
            voice: variant.speech.voice,
            audio_mime_type: variant.speech.audio_mime_type,
            audio_base64_bytes: variant.speech.audio_base64.length,
            duration_ms: variant.speech.duration_ms,
          }
        : null,
      speech_error: variant.speech_error,
    })),
    conversation: result.conversation,
  };
}
