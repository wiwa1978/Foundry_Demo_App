import { useEffect, useState } from "react";

import { loadLiveTranslationSettings, saveLiveTranslationSettings } from "@/api/admin";
import type { FetchClient, UseCaseResourceSettings } from "@/api/types";

const emptySettings: UseCaseResourceSettings = {
  use_case: "live_translation",
  binding: "",
  available_bindings: [],
};

export function useLiveTranslationSettings({
  fetchClient,
  enabled,
}: {
  fetchClient: FetchClient;
  enabled: boolean;
}) {
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    void loadLiveTranslationSettings(fetchClient, controller.signal)
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.detail ?? "Failed to load Live Interpreter settings.");
        setSettings(data);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, fetchClient]);

  async function save(binding: string) {
    setSaving(true);
    setMessage("");
    try {
      const { response, data } = await saveLiveTranslationSettings(fetchClient, { binding });
      if (!response.ok) throw new Error(data.detail ?? "Failed to save Live Interpreter settings.");
      setSettings(data);
      setMessage("Live Interpreter resource saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save Live Interpreter settings.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  return { loading, message, save, saving, settings };
}
