import { describe, expect, it, vi } from "vitest";

import { generateImage } from "./api";

describe("Image API", () => {
  it("posts generation parameters", async () => {
    const fetchClient = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const request = {
      model: "image-model",
      prompt: "fox",
      width: 1024,
      height: 1024,
    };
    await generateImage(fetchClient, request);
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/images/generate",
      expect.objectContaining({ body: JSON.stringify(request) }),
      expect.any(Object),
    );
  });
});
