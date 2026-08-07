import { describe, expect, it } from "vitest";

import { readPublicApiError } from "@/api/errors";

describe("readPublicApiError", () => {
  it("returns a public detail string", async () => {
    const response = new Response(
      JSON.stringify({ detail: "Request denied.", code: "invalid_request" }),
    );
    await expect(readPublicApiError(response, "Fallback")).resolves.toBe(
      "Request denied.",
    );
  });

  it("uses the fallback for a non-JSON response", async () => {
    const response = new Response("Gateway error");
    await expect(readPublicApiError(response, "Request failed.")).resolves.toBe(
      "Request failed.",
    );
  });
});
