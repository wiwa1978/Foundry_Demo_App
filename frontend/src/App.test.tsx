import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary, AppLoadingState } from "./App";

class BrokenChild extends Component {
  render(): ReactNode {
    throw new Error("render failure");
  }
}

describe("application shell", () => {
  it("renders the loading state", () => {
    render(<AppLoadingState />);
    expect(screen.getByText("Loading Foundry Demo...")).toBeInTheDocument();
  });

  it("contains workspace render failures", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );
    expect(
      screen.getByText("Foundry Demo could not start"),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
