import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Conversation } from "@/features/textChat/types";
import { cn } from "@/lib/utils";

type ConversationContextMenu = {
  conversation: Conversation;
  x: number;
  y: number;
};

type ConversationDateGroup = {
  key: string;
  label: string;
  conversations: Conversation[];
};

function groupConversationsByDate(
  conversations: Conversation[],
): ConversationDateGroup[] {
  const groups: ConversationDateGroup[] = [];
  const groupByKey = new Map<string, ConversationDateGroup>();
  for (const conversation of conversations) {
    const timestamp = new Date(conversation.updated_at);
    const validTimestamp = Number.isNaN(timestamp.getTime()) ? null : timestamp;
    const key = validTimestamp
      ? `${validTimestamp.getFullYear()}-${validTimestamp.getMonth()}-${validTimestamp.getDate()}`
      : "unknown";
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        label: validTimestamp
          ? new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            }).format(validTimestamp)
          : "Unknown date",
        conversations: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.conversations.push(conversation);
  }
  return groups;
}

function formatConversationDateTime(conversation: Conversation) {
  const timestamp = new Date(conversation.updated_at);
  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export type ConversationHistoryPopoverProps = {
  open: boolean;
  conversations: Conversation[];
  currentConversationId: string | null;
  onClose: () => void;
  onNewChat: () => void | Promise<void>;
  onLoad: (conversationId: string) => void | Promise<void>;
  onDelete: (conversation: Conversation) => void | Promise<void>;
};

export function ConversationHistoryPopover({
  open,
  conversations,
  currentConversationId,
  onClose,
  onNewChat,
  onLoad,
  onDelete,
}: ConversationHistoryPopoverProps) {
  const [contextMenu, setContextMenu] =
    useState<ConversationContextMenu | null>(null);
  const conversationGroups = groupConversationsByDate(conversations);

  useEffect(() => {
    if (!open) {
      setContextMenu(null);
      return;
    }

    const closeContextMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (contextMenu) {
        closeContextMenu();
      } else {
        onClose();
      }
    };

    if (contextMenu) {
      window.addEventListener("click", closeContextMenu);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, onClose, open]);

  function closePopover() {
    setContextMenu(null);
    onClose();
  }

  async function startNewChat() {
    await onNewChat();
    closePopover();
  }

  async function loadConversation(conversationId: string) {
    await onLoad(conversationId);
    closePopover();
  }

  function deleteConversation(conversation: Conversation) {
    setContextMenu(null);
    void onDelete(conversation);
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm dark:bg-black/40">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="previous-conversations-title"
          className="w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-[#606066] dark:bg-[#39393d]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="previous-conversations-title"
              className="text-sm font-semibold"
            >
              Previous Conversations
            </h2>
            <button
              type="button"
              onClick={closePopover}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#45454a]"
              aria-label="Close previous conversations"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => void startNewChat()}
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
          <div className="mt-4 grid max-h-[72vh] gap-4 overflow-y-auto pr-1">
            {conversationGroups.length ? (
              conversationGroups.map((group) => (
                <section key={group.key} className="grid gap-1">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {group.label}
                  </h3>
                  {group.conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu({
                          conversation,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      className={cn(
                        "group flex items-center rounded-md text-sm transition hover:bg-slate-100 dark:hover:bg-[#45454a]",
                        currentConversationId === conversation.id &&
                          "bg-slate-100 font-medium dark:bg-[#45454a]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void loadConversation(conversation.id)}
                        className="min-w-0 flex-1 px-2 py-2 text-left"
                        title={conversation.title}
                        aria-label={conversation.title}
                      >
                        <span className="block truncate">
                          {conversation.title}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                          {formatConversationDateTime(conversation)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(conversation)}
                        className="mr-1 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                        aria-label={`Delete ${conversation.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </section>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">
                No saved chats yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-44 rounded-md border bg-white p-1 shadow-lg dark:border-[#606066] dark:bg-[#29292c]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
            onClick={() => deleteConversation(contextMenu.conversation)}
          >
            <Trash2 className="h-4 w-4" />
            Delete conversation
          </button>
        </div>
      ) : null}
    </>
  );
}
