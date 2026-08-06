export async function readServerSentEvents<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<T[]> {
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parsedEvents: T[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const records = buffer.split("\n\n");
    buffer = records.pop() ?? "";
    for (const record of records) {
      const event = parseServerSentEvent<T>(record);
      if (event !== null) {
        parsedEvents.push(event);
        onEvent(event);
      }
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, "\n");
  if (buffer.trim()) {
    const event = parseServerSentEvent<T>(buffer);
    if (event !== null) {
      parsedEvents.push(event);
      onEvent(event);
    }
  }
  return parsedEvents;
}

export function parseServerSentEvent<T>(rawEvent: string): T | null {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  return data ? (JSON.parse(data) as T) : null;
}
