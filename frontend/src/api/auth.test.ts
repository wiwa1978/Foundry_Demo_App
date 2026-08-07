import { describe, expect, it, vi } from "vitest";

import type { FetchClient } from "@/api/types";

import { loadCurrentUser } from "./auth";

describe("loadCurrentUser", () => {
  it("does not include identity data in API response traces", async () => {
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(
      Response.json({
        authenticated: true,
        entra_auth_enabled: true,
        name: "Test User",
        email: "user@example.test",
        user_id: "identity-1",
      }),
    );

    await expect(
      loadCurrentUser(fetchClient, new AbortController().signal),
    ).resolves.toEqual(expect.objectContaining({ authenticated: true }));
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.any(Object),
      expect.objectContaining({ traceResponse: false }),
    );
  });
});
