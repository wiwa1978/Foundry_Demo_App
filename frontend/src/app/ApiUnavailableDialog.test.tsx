import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiUnavailableDialog } from "./ApiUnavailableDialog";

describe("ApiUnavailableDialog", () => {
  it("blocks the workspace with an API unavailable warning", () => {
    render(<ApiUnavailableDialog reason="Failed to fetch" onRetry={vi.fn()} />);

    const dialog = screen.getByRole("alertdialog", { name: "API unavailable" });
    expect(dialog).toBeVisible();
    expect(
      screen.getByText(/The frontend cannot contact the Foundry Chat API/i),
    ).toBeVisible();
    expect(screen.getByText("Failed to fetch")).toBeVisible();
  });

  it("requests a reconnect when retrying", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ApiUnavailableDialog reason={null} onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /retry connection/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
