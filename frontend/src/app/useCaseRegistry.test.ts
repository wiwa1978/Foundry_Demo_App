import { describe, expect, it } from "vitest";

import { useCaseModules } from "./useCaseRegistry";

describe("useCaseModules", () => {
  it("registers each use case exactly once", () => {
    const ids = useCaseModules.map((useCase) => useCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("text_chat");
  });

  it("provides complete marketplace metadata", () => {
    for (const useCase of useCaseModules) {
      expect(useCase.title).not.toBe("");
      expect(useCase.modalities.length).toBeGreaterThan(0);
      expect(useCase.implementation.length).toBeGreaterThan(0);
      expect(useCase.codeSnippet.code).not.toBe("");
    }
  });
});
