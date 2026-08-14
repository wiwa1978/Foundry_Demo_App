export function youtubeRealtimeTranscriptionWebSocketUrl({
  url,
  model,
  language,
  delay,
}: {
  url: string;
  model: string;
  language: string | null;
  delay: string | null;
}) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const endpoint = new URL(
    `${protocol}//${window.location.host}/api/youtube/realtime-transcribe`,
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("model", model);
  if (language) endpoint.searchParams.set("language", language);
  if (delay) endpoint.searchParams.set("delay", delay);
  return endpoint.toString();
}
