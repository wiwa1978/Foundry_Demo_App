import { describe, expect, it } from "vitest";

import type { UseCaseModule } from "./types";
import { registerUseCases, useCaseModules } from "./useCaseRegistry";

describe("useCaseModules", () => {
  it("registers each use case exactly once", () => {
    const ids = useCaseModules.map((useCase) => useCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("text_chat");
    expect(ids).toContain("youtube_summary");
  });

  it("provides complete marketplace metadata", () => {
    for (const useCase of useCaseModules) {
      expect(useCase.title).not.toBe("");
      expect(useCase.modalities.length).toBeGreaterThan(0);
      expect(useCase.implementation.length).toBeGreaterThan(0);
      expect(useCase.codeSnippet.code).not.toBe("");
    }
  });

  it("rejects duplicate and incomplete registrations", () => {
    const module = useCaseModules[0];
    expect(() => registerUseCases([module, module])).toThrow(
      "Duplicate use-case registration",
    );
    expect(() =>
      registerUseCases([{ ...module, title: "" } as UseCaseModule]),
    ).toThrow("Incomplete use-case registration");
  });
});
