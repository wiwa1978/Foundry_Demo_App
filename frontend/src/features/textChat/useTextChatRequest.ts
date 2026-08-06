import { useEffect, useRef } from "react";

import { streamTextChat, type FetchClient } from "./api";
import type { ChatStreamEvent, TextChatRequest } from "./types";

export function useTextChatRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function stream(options: {
    request: TextChatRequest;
    fetchClient: FetchClient;
    onEvent: (event: ChatStreamEvent) => void;
  }) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      return await streamTextChat({ ...options, signal: controller.signal });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  return { stream, cancel };
}
