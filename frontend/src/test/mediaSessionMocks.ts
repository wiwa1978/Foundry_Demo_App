import { vi } from "vitest";

export class MockMediaStreamTrack {
  stop = vi.fn();
}

export class MockMediaStream {
  readonly track = new MockMediaStreamTrack();

  getTracks() {
    return [this.track];
  }
}

export class MockMediaRecorder extends EventTarget {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn((type: string) =>
    type.startsWith("audio/webm"),
  );

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(
    readonly stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    super();
    this.mimeType = options?.mimeType ?? "";
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }

  emitData(data: Blob) {
    const event = new Event("dataavailable") as BlobEvent;
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }

  emitError() {
    this.dispatchEvent(new Event("error"));
  }
}

export class MockDataChannel extends EventTarget {
  readonly close = vi.fn(() => this.dispatchEvent(new Event("close")));

  emitMessage(data: string | ArrayBuffer) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  open() {
    this.dispatchEvent(new Event("open"));
  }
}

export class MockPeerConnection extends EventTarget {
  static instances: MockPeerConnection[] = [];
  static initialIceGatheringState: RTCIceGatheringState = "complete";

  readonly dataChannel = new MockDataChannel();
  readonly close = vi.fn();
  readonly setRemoteDescription = vi.fn(() => Promise.resolve());
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState =
    MockPeerConnection.initialIceGatheringState;
  localDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  private readonly senders: Array<{ track: MediaStreamTrack }> = [];

  constructor() {
    super();
    MockPeerConnection.instances.push(this);
  }

  addTransceiver = vi.fn();

  addTrack(track: MediaStreamTrack) {
    this.senders.push({ track });
  }

  createDataChannel() {
    return this.dataChannel;
  }

  createOffer() {
    return Promise.resolve({ type: "offer" as const, sdp: "mock-offer" });
  }

  getSenders() {
    return this.senders;
  }

  setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    return Promise.resolve();
  }

  connect() {
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
  }

  fail() {
    this.connectionState = "failed";
    this.onconnectionstatechange?.();
  }
}

export class MockAudioElement extends EventTarget {
  static instances: MockAudioElement[] = [];

  autoplay = false;
  srcObject: MediaProvider | null = null;
  readonly pause = vi.fn();
  readonly play = vi.fn(() => Promise.resolve());

  constructor() {
    super();
    MockAudioElement.instances.push(this);
  }
}

type SocketMode = "success" | "open-error" | "manual" | "sync-open";

export class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static mode: SocketMode = "success";

  binaryType: BinaryType = "blob";
  readyState = MockWebSocket.CONNECTING;
  readonly sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  readonly url: string;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    MockWebSocket.instances.push(this);
    if (MockWebSocket.mode === "sync-open") {
      this.open();
      return;
    }
    queueMicrotask(() => {
      if (
        MockWebSocket.mode === "manual" ||
        this.readyState !== MockWebSocket.CONNECTING
      )
        return;
      if (MockWebSocket.mode === "open-error") {
        this.dispatchEvent(new Event("error"));
        return;
      }
      this.open();
    });
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close"));
  }

  emitMessage(data: string | ArrayBuffer) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data);
    if (MockWebSocket.mode !== "success" || typeof data !== "string") return;
    const message = JSON.parse(data) as { type?: string };
    if (message.type === "rtc.call.sdp.create") {
      queueMicrotask(() =>
        this.emitMessage(
          JSON.stringify({
            type: "rtc.call.sdp.created",
            sdp_answer: "mock-answer",
          }),
        ),
      );
    }
    if (message.type === "session.update") {
      queueMicrotask(() =>
        this.emitMessage(
          JSON.stringify({
            type: "session.updated",
            session: { avatar: { ice_servers: [{ urls: ["stun:mock"] }] } },
          }),
        ),
      );
    }
    if (message.type === "session.avatar.connect") {
      queueMicrotask(() =>
        this.emitMessage(
          JSON.stringify({
            type: "session.avatar.connecting",
            server_sdp: btoa(
              JSON.stringify({ type: "answer", sdp: "mock-avatar-answer" }),
            ),
          }),
        ),
      );
    }
    if (message.type === "start") {
      queueMicrotask(() => this.emitMessage(JSON.stringify({ type: "ready" })));
    }
  }
}

class MockConnectNode {
  readonly connect = vi.fn((destination: unknown) => destination);
  readonly disconnect = vi.fn();
}

export class MockMediaStreamAudioSourceNode extends MockConnectNode {}

export class MockGainNode extends MockConnectNode {
  gain = { value: 1 };
}

export class MockAudioBufferSourceNode extends MockConnectNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

export class MockAudioWorkletNode extends MockConnectNode {
  static instances: MockAudioWorkletNode[] = [];

  port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null } = {
    onmessage: null,
  };

  constructor() {
    super();
    MockAudioWorkletNode.instances.push(this);
  }
}

export class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly audioWorklet = { addModule: vi.fn(() => Promise.resolve()) };
  readonly bufferSources: MockAudioBufferSourceNode[] = [];
  readonly close = vi.fn(() => Promise.resolve());
  readonly currentTime = 1;
  readonly destination = {};
  readonly gain = new MockGainNode();
  readonly resume = vi.fn(() => Promise.resolve());
  readonly source = new MockMediaStreamAudioSourceNode();

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    const channel = new Float32Array(length);
    return {
      duration: length / sampleRate,
      getChannelData: () => channel,
    };
  }

  createBufferSource() {
    const source = new MockAudioBufferSourceNode();
    this.bufferSources.push(source);
    return source;
  }

  createGain() {
    return this.gain;
  }

  createMediaStreamSource() {
    return this.source;
  }
}

export function installMediaSessionMocks() {
  MockPeerConnection.instances = [];
  MockPeerConnection.initialIceGatheringState = "complete";
  MockAudioElement.instances = [];
  MockWebSocket.instances = [];
  MockWebSocket.mode = "success";
  MockAudioContext.instances = [];
  MockAudioWorkletNode.instances = [];
  MockMediaRecorder.instances = [];
  MockMediaRecorder.isTypeSupported.mockClear();

  const streams: MockMediaStream[] = [];
  const getUserMedia = vi.fn(() => {
    const stream = new MockMediaStream();
    streams.push(stream);
    return Promise.resolve(stream as unknown as MediaStream);
  });

  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia },
  });
  vi.stubGlobal("Audio", MockAudioElement);
  vi.stubGlobal("RTCPeerConnection", MockPeerConnection);
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);

  return { getUserMedia, streams };
}
