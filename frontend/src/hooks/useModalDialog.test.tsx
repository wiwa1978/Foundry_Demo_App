import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useModalDialog } from "@/hooks/useModalDialog";

function Dialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);

  return (
    <div ref={dialogRef} role="dialog" aria-label="Test dialog" tabIndex={-1}>
      <button type="button">First action</button>
      <button type="button" disabled>
        Disabled action
      </button>
      <input aria-label="Dialog input" />
      <a href="/last">Last action</a>
    </div>
  );
}

function ModalHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <Dialog
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function EmptyDialog() {
  const dialogRef = useModalDialog<HTMLDivElement>(() => undefined);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Empty dialog"
      tabIndex={-1}
    />
  );
}

describe("useModalDialog", () => {
  it("focuses the first control, traps tab navigation, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open dialog" });

    await user.click(opener);

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("link", { name: "Last action" });
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("focuses the dialog itself when it has no focusable descendants", () => {
    render(<EmptyDialog />);

    expect(screen.getByRole("dialog", { name: "Empty dialog" })).toHaveFocus();
  });
});
