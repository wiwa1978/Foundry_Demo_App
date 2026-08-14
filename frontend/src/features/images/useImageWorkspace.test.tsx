import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient, ModelModality } from "@/api/types";
import type { UseCaseWorkspace } from "@/app/types";
import type { ImageGenerationResult } from "@/app/workspace/contracts";
import type { Conversation, StoredMessage } from "@/features/textChat/types";

import {
  editImage,
  generateImage,
  getImageSample,
  listImageSamples,
} from "./api";
import { useImageWorkspace } from "./useImageWorkspace";

vi.mock("./api", () => ({
  generateImage: vi.fn(),
  editImage: vi.fn(),
  getImageSample: vi.fn(),
  listImageSamples: vi.fn(),
}));

const fetchClient = vi.fn<FetchClient>();
const models = ["image-a", "image-b", "image-c", "gpt-image-edit"];
const modelModalities = Object.fromEntries(
  models.map((model) => [model, ["image"]]),
) as Record<string, ModelModality[]>;

function imageResponse(model: string, image = model) {
  return new Response(
    JSON.stringify({
      model,
      image_base64: image,
      mime_type: "image/png",
      width: 1024,
      height: 1024,
      duration_ms: 10,
      conversation: {
        id: "conversation-1",
        title: "fox",
        use_case: "text_to_image",
        created_at: "2026-08-13T10:00:00Z",
        updated_at: "2026-08-13T10:00:00Z",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

type ImageHookProps = {
  workspace: UseCaseWorkspace;
  currentConversationId?: string | null;
};

function setup(
  initialWorkspace: UseCaseWorkspace = "image",
  options: {
    useCase?: "text_to_image";
    currentConversationId?: string | null;
    onConversationStored?: (conversation: Conversation) => void;
  } = {},
) {
  const onModelChange = vi.fn();
  const onConversationStored = options.onConversationStored ?? vi.fn();
  const hook = renderHook(
    ({ workspace, currentConversationId }: ImageHookProps) =>
      useImageWorkspace({
        fetchClient,
        models,
        modelModalities,
        workspace,
        useCase: options.useCase,
        currentConversationId,
        onModelChange,
        onConversationStored,
      }),
    {
      initialProps: {
        workspace: initialWorkspace,
        currentConversationId: options.currentConversationId ?? null,
      },
    },
  );
  return { ...hook, onModelChange, onConversationStored };
}

describe("useImageWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listImageSamples).mockResolvedValue([]);
    vi.mocked(getImageSample).mockResolvedValue(
      new File(["sample"], "sample.jpg", { type: "image/jpeg" }),
    );
  });

  it("reconciles compatible models and enforces the comparison limit", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.model).toBe("image-a"));
    expect(result.current.selected).toEqual(["image-a", "image-b"]);

    act(() => result.current.toggleComparisonModel("image-c"));
    expect(result.current.selected).toEqual(["image-a", "image-b"]);
    act(() => result.current.toggleComparisonModel("image-a"));
    act(() => result.current.toggleComparisonModel("image-c"));
    expect(result.current.selected).toEqual(["image-b", "image-c"]);
    act(() => result.current.replaceComparisonModel("image-b", "image-a"));
    expect(result.current.selected).toEqual(["image-a", "image-c"]);

    rerender({ workspace: "imageEdit", currentConversationId: null });
    await waitFor(() => expect(result.current.model).toBe("gpt-image-edit"));
  });

  it("generates and edits with preserved payloads and source reset behavior", async () => {
    vi.mocked(generateImage).mockResolvedValue(imageResponse("image-a"));
    vi.mocked(editImage).mockResolvedValue(imageResponse("gpt-image-edit"));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.model).toBe("image-a"));

    act(() => {
      result.current.setPrompt("  a fox  ");
      result.current.setSize("768x1024");
    });
    await act(async () => result.current.runGeneration());
    expect(generateImage).toHaveBeenCalledWith(
      fetchClient,
      { model: "image-a", prompt: "a fox", width: 768, height: 1024 },
      expect.any(AbortSignal),
    );
    expect(result.current.result?.prompt).toBe("a fox");
    expect(result.current.submittedPrompt).toBe("a fox");
    expect(result.current.prompt).toBe("");

    rerender({ workspace: "imageEdit", currentConversationId: null });
    await waitFor(() => expect(result.current.model).toBe("gpt-image-edit"));
    const source = new File(["image"], "source.png", { type: "image/png" });
    act(() => {
      result.current.setPrompt("a fox");
      result.current.setEditSource(source);
    });
    await act(async () => result.current.runEdit());
    expect(editImage).toHaveBeenCalledWith(
      fetchClient,
      expect.objectContaining({
        model: "gpt-image-edit",
        prompt: "a fox",
        image: source,
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.editResult?.prompt).toBe("a fox");
    expect(result.current.prompt).toBe("");
    act(() => result.current.setEditSource(null));
    expect(result.current.editResult).toBeNull();
    expect(result.current.editError).toBe("");
  });

  it("persists text-to-image generations without storing gallery images by default", async () => {
    vi.mocked(generateImage).mockResolvedValue(imageResponse("image-a"));
    const { result, onConversationStored } = setup("image", {
      useCase: "text_to_image",
      currentConversationId: "conversation-0",
    });
    await waitFor(() => expect(result.current.model).toBe("image-a"));

    expect(result.current.saveToGallery).toBe(false);
    act(() => result.current.setPrompt("  a fox  "));
    await act(async () => result.current.runGeneration());

    expect(generateImage).toHaveBeenCalledWith(
      fetchClient,
      expect.objectContaining({
        prompt: "a fox",
        conversation_id: "conversation-0",
        use_case: "text_to_image",
      }),
      expect.any(AbortSignal),
    );
    expect(vi.mocked(generateImage).mock.calls[0]?.[1]).not.toHaveProperty(
      "save_to_gallery",
    );
    expect(onConversationStored).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    );
  });

  it("stores text-to-image generations in the gallery only when opted in", async () => {
    vi.mocked(generateImage).mockResolvedValue(imageResponse("image-a"));
    const { result } = setup("image", {
      useCase: "text_to_image",
      currentConversationId: "conversation-0",
    });
    await waitFor(() => expect(result.current.model).toBe("image-a"));

    act(() => {
      result.current.setSaveToGallery(true);
      result.current.setPrompt("  a fox  ");
    });
    await act(async () => result.current.runGeneration());

    expect(generateImage).toHaveBeenCalledWith(
      fetchClient,
      expect.objectContaining({ save_to_gallery: true }),
      expect.any(AbortSignal),
    );
  });

  it("hydrates generated images from stored conversation messages", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.model).toBe("image-a"));
    const messages: StoredMessage[] = [
      {
        id: "user-1",
        conversation_id: "conversation-1",
        role: "user",
        content: "stored fox",
        model: null,
        api_surface: null,
        duration_ms: null,
        usage: null,
        error: null,
        guardrail_variant: null,
        guardrail_policy_name: null,
        guardrail_results: null,
        created_at: "2026-08-13T10:00:00Z",
      },
      {
        id: "assistant-1",
        conversation_id: "conversation-1",
        role: "assistant",
        content: JSON.stringify({
          kind: "image_generation",
          model: "image-b",
          image_base64: "stored-data",
          mime_type: "image/png",
          width: 1024,
          height: 1024,
          duration_ms: 12,
        }),
        model: "image-b",
        api_surface: null,
        duration_ms: 12,
        usage: null,
        error: null,
        guardrail_variant: null,
        guardrail_policy_name: null,
        guardrail_results: null,
        created_at: "2026-08-13T10:00:01Z",
      },
    ];

    act(() => result.current.loadGenerationFromMessages(messages));

    expect(result.current.result).toMatchObject({
      model: "image-b",
      image_base64: "stored-data",
      prompt: "stored fox",
    });
    expect(result.current.submittedPrompt).toBe("stored fox");
  });

  it("prevents a stale generation from overwriting state after model change", async () => {
    let resolveRequest: (value: Response) => void = () => undefined;
    vi.mocked(generateImage).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.model).toBe("image-a"));
    act(() => result.current.setPrompt("old prompt"));
    act(() => void result.current.runGeneration());
    await waitFor(() => expect(result.current.generating).toBe(true));
    expect(result.current.prompt).toBe("");
    expect(result.current.submittedPrompt).toBe("old prompt");
    const signal = vi.mocked(generateImage).mock.calls[0][2];

    act(() => result.current.setModel("image-b"));
    expect(signal?.aborted).toBe(true);
    expect(result.current.generating).toBe(false);
    await act(async () => resolveRequest(imageResponse("image-a", "stale")));
    expect(result.current.result).toBeNull();
  });

  it("keeps the completed image while a new prompt is generating", async () => {
    vi.mocked(generateImage).mockResolvedValueOnce(
      imageResponse("image-a", "first"),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.model).toBe("image-a"));
    act(() => result.current.setPrompt("first prompt"));
    await act(async () => result.current.runGeneration());

    let resolveRequest: (value: Response) => void = () => undefined;
    vi.mocked(generateImage).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    act(() => result.current.setPrompt("second prompt"));
    act(() => void result.current.runGeneration());

    await waitFor(() => expect(result.current.generating).toBe(true));
    expect(result.current.submittedPrompt).toBe("second prompt");
    expect(result.current.result).toMatchObject({
      image_base64: "first",
      prompt: "first prompt",
    });

    await act(async () => resolveRequest(imageResponse("image-a", "second")));
    expect(result.current.result).toMatchObject({
      image_base64: "second",
      prompt: "second prompt",
    });
  });

  it("preserves partial comparison successes and per-model errors", async () => {
    vi.mocked(generateImage).mockImplementation((_client, request) =>
      request.model === "image-a"
        ? Promise.resolve(imageResponse("image-a", "success"))
        : Promise.reject(new Error("Provider unavailable")),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.selected).toHaveLength(2));
    act(() => result.current.setPrompt("same prompt"));
    await act(async () => result.current.runComparison());

    expect(result.current.comparisonResults["image-a"]).toMatchObject({
      image_base64: "success",
      prompt: "same prompt",
    } satisfies Partial<ImageGenerationResult>);
    expect(result.current.comparisonErrors).toEqual({
      "image-b": "Provider unavailable",
    });
    expect(result.current.prompt).toBe("");
    expect(result.current.comparisonGenerating).toBe(false);
  });

  it("invalidates comparison results when the use case changes", async () => {
    const resolvers: Array<(value: Response) => void> = [];
    vi.mocked(generateImage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, rerender } = setup("imageComparison");
    await waitFor(() => expect(result.current.selected).toHaveLength(2));
    act(() => result.current.setPrompt("old comparison"));
    act(() => void result.current.runComparison());
    await waitFor(() => expect(result.current.comparisonGenerating).toBe(true));

    rerender({ workspace: "chat", currentConversationId: null });
    expect(result.current.comparisonGenerating).toBe(false);
    await act(async () => {
      resolvers.forEach((resolve, index) =>
        resolve(imageResponse(`image-${index}`, "stale")),
      );
    });
    expect(result.current.comparisonResults).toEqual({});
  });
});
