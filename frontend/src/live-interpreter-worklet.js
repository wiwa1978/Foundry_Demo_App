class LiveInterpreterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.position = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    const ratio = sampleRate / 16000;
    while (this.position < input.length) {
      const left = Math.floor(this.position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = this.position - left;
      const sample = input[left] + (input[right] - input[left]) * fraction;
      this.pending.push(Math.max(-1, Math.min(1, sample)));
      this.position += ratio;
    }
    this.position -= input.length;

    if (this.pending.length >= 640) {
      const pcm = new Int16Array(this.pending.splice(0, 640).map((sample) =>
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      ));
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("live-interpreter-processor", LiveInterpreterProcessor);
