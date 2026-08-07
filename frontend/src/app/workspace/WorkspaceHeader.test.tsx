import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceHeader, type WorkspaceHeaderProps } from "./WorkspaceHeader";

function headerProps(
  overrides: Partial<WorkspaceHeaderProps> = {},
): WorkspaceHeaderProps {
  return {
    navigation: {
      activeView: "chat",
      onOpenUseCases: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenMetrics: vi.fn(),
    },
    appearance: {
      theme: "light",
      onToggleTheme: vi.fn(),
    },
    auth: {
      authenticated: false,
      entraAuthEnabled: true,
      displayName: "Signed in",
    },
    trace: {
      entryCount: 0,
      onOpen: vi.fn(),
      onClose: vi.fn(),
    },
    activity: {
      useCaseName: "Text chat",
      status: null,
    },
    ...overrides,
  };
}

describe("WorkspaceHeader", () => {
  it("renders signed-out navigation and handles use-case, settings, and theme actions", async () => {
    const user = userEvent.setup();
    const props = headerProps();
    render(<WorkspaceHeader {...props} />);

    expect(screen.getByRole("heading", { name: "Foundry Demo" })).toBeVisible();
    expect(screen.getByText("Text chat")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign in with Microsoft" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /use cases/i }));
    await user.click(screen.getByRole("button", { name: "Open app settings" }));
    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );

    expect(props.navigation.onOpenUseCases).toHaveBeenCalledOnce();
    expect(props.navigation.onOpenSettings).toHaveBeenCalledOnce();
    expect(props.trace.onClose).toHaveBeenCalledOnce();
    expect(props.appearance.onToggleTheme).toHaveBeenCalledOnce();
  });

  it("renders the unavailable signed-out state", () => {
    render(
      <WorkspaceHeader
        {...headerProps({
          appearance: { theme: "dark", onToggleTheme: vi.fn() },
          auth: {
            authenticated: false,
            entraAuthEnabled: false,
            displayName: "Signed in",
          },
          activity: { useCaseName: "Voice", status: "Live" },
        })}
      />,
    );

    expect(screen.getByText("Live")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign-in unavailable locally" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeVisible();
  });

  it("renders the signed-in account and handles metrics, trace, and account theme actions", async () => {
    const user = userEvent.setup();
    const props = headerProps({
      auth: {
        authenticated: true,
        entraAuthEnabled: true,
        displayName: "Ada Lovelace",
      },
      trace: {
        entryCount: 3,
        onOpen: vi.fn(),
        onClose: vi.fn(),
      },
    });
    const { rerender } = render(<WorkspaceHeader {...props} />);

    const account = screen.getByText("Ada Lovelace").closest("details");
    expect(account).not.toBeNull();
    if (account) {
      account.open = true;
    }
    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/api/auth/logout",
    );
    expect(screen.getByText("3")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Model metrics" }));
    expect(props.navigation.onOpenMetrics).toHaveBeenCalledOnce();
    expect(props.trace.onClose).toHaveBeenCalledOnce();
    expect(account).not.toHaveAttribute("open");

    rerender(<WorkspaceHeader {...props} />);
    await user.click(screen.getByRole("button", { name: /api trace/i }));
    expect(props.trace.onOpen).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(props.appearance.onToggleTheme).toHaveBeenCalledOnce();
  });
});
