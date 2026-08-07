import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Conversation } from "@/features/textChat/types";

import { ConversationHistoryPopover } from "./ConversationHistoryPopover";

const conversations: Conversation[] = [
  {
    id: "conversation-1",
    title: "First conversation",
    use_case: "text_chat",
    created_at: "2026-08-07T10:00:00Z",
    updated_at: "2026-08-07T10:00:00Z",
  },
  {
    id: "conversation-2",
    title: "Second conversation",
    use_case: "text_chat",
    created_at: "2026-08-07T11:00:00Z",
    updated_at: "2026-08-07T11:00:00Z",
  },
];

describe("ConversationHistoryPopover", () => {
  it("renders only while open and shows the empty state", () => {
    const props = {
      conversations: [],
      currentConversationId: null,
      onClose: vi.fn(),
      onNewChat: vi.fn(),
      onLoad: vi.fn(),
      onDelete: vi.fn(),
    };
    const { rerender } = render(
      <ConversationHistoryPopover open={false} {...props} />,
    );
    expect(
      screen.queryByRole("heading", { name: "Previous Conversations" }),
    ).not.toBeInTheDocument();

    rerender(<ConversationHistoryPopover open {...props} />);
    expect(screen.getByText("No saved chats yet.")).toBeVisible();
  });

  it("loads conversations, starts a new chat, deletes, and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNewChat = vi.fn();
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <ConversationHistoryPopover
        open
        conversations={conversations}
        currentConversationId="conversation-1"
        onClose={onClose}
        onNewChat={onNewChat}
        onLoad={onLoad}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Second conversation" }),
    );
    expect(onLoad).toHaveBeenCalledWith("conversation-2");
    expect(onClose).toHaveBeenCalledOnce();

    onClose.mockClear();
    rerender(
      <ConversationHistoryPopover
        open
        conversations={conversations}
        currentConversationId="conversation-1"
        onClose={onClose}
        onNewChat={onNewChat}
        onLoad={onLoad}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Delete First conversation" }),
    );
    expect(onDelete).toHaveBeenCalledWith(conversations[0]);

    await user.click(
      screen.getByRole("button", { name: "Close previous conversations" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("positions and dismisses the context menu with click and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <ConversationHistoryPopover
        open
        conversations={conversations}
        currentConversationId={null}
        onClose={onClose}
        onNewChat={vi.fn()}
        onLoad={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "First conversation" }),
      { clientX: 140, clientY: 210 },
    );
    const menuAction = screen.getByRole("button", {
      name: "Delete conversation",
    });
    expect(menuAction.parentElement).toHaveStyle({
      left: "140px",
      top: "210px",
    });

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("button", { name: "Delete conversation" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Second conversation" }),
      { clientX: 20, clientY: 30 },
    );
    await user.click(
      screen.getByRole("button", { name: "Delete conversation" }),
    );
    expect(onDelete).toHaveBeenCalledWith(conversations[1]);

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "First conversation" }),
    );
    fireEvent.click(window);
    expect(
      screen.queryByRole("button", { name: "Delete conversation" }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "First conversation" }),
    );
    rerender(
      <ConversationHistoryPopover
        open={false}
        conversations={conversations}
        currentConversationId={null}
        onClose={onClose}
        onNewChat={vi.fn()}
        onLoad={vi.fn()}
        onDelete={onDelete}
      />,
    );
    rerender(
      <ConversationHistoryPopover
        open
        conversations={conversations}
        currentConversationId={null}
        onClose={onClose}
        onNewChat={vi.fn()}
        onLoad={vi.fn()}
        onDelete={onDelete}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Delete conversation" }),
    ).not.toBeInTheDocument();
  });
});
