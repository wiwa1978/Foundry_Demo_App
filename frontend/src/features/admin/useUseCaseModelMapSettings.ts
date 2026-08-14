import { useEffect, useState } from "react";

import {
  loadUseCaseModelMapSettings,
  saveUseCaseModelMapSettings,
} from "@/api/admin";
import type {
  FetchClient,
  ModelBucketName,
  UseCaseModelMap,
  UseCaseModelMapSettings,
} from "@/api/types";

const emptySettings: UseCaseModelMapSettings = {
  use_case_model_map: {},
  bucket_names: [],
};

export function useUseCaseModelMapSettings({
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
    void loadUseCaseModelMapSettings(fetchClient, controller.signal)
      .then(({ response, data }) => {
        if (!response.ok)
          throw new Error(data.detail ?? "Failed to load use case model map.");
        setSettings(data);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, fetchClient]);

  async function save(useCaseModelMap: UseCaseModelMap) {
    setSaving(true);
    setMessage("");
    try {
      const { response, data } = await saveUseCaseModelMapSettings(
        fetchClient,
        useCaseModelMap,
      );
      if (!response.ok)
        throw new Error(data.detail ?? "Failed to save use case model map.");
      setSettings(data);
      setMessage("Use case model map saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save use case model map.",
      );
      throw error;
    } finally {
      setSaving(false);
    }
  }

  return {
    bucketNames: settings.bucket_names as ModelBucketName[],
    loading,
    message,
    save,
    saving,
    useCaseModelMap: settings.use_case_model_map,
  };
}
