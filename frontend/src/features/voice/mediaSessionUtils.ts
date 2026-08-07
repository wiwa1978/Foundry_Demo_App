export function stopMediaTracks(
  peerConnection: RTCPeerConnection | null,
  mediaStream: MediaStream | null,
) {
  const tracks = new Set<MediaStreamTrack>();
  peerConnection?.getSenders().forEach((sender) => {
    if (sender.track) tracks.add(sender.track);
  });
  mediaStream?.getTracks().forEach((track) => tracks.add(track));
  tracks.forEach((track) => track.stop());
}

export function stopStreamTracks(mediaStream: MediaStream | null) {
  mediaStream?.getTracks().forEach((track) => track.stop());
}

export function getRecorderMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  return MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
}

export function closeRemoteAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.srcObject = null;
}
