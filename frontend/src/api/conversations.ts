import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import type { UseCaseId } from "@/app/types";
import type { Conversation, StoredMessage } from "@/features/textChat/types";

const conversationsEndpoint = "/api/conversations";

export async function listConversations(
  fetchClient: FetchClient,
  useCase: UseCaseId,
) {
  const conversations: Conversation[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ use_case: useCase, limit: "100" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await fetchClient(
      `${conversationsEndpoint}?${query.toString()}`,
      {},
      { label: "List conversations", responseKind: "json" },
    );
    if (!response.ok) {
      throw new Error(
        await readPublicApiError(response, "Failed to load conversations."),
      );
    }
    const data = (await response.json()) as {
      conversations?: Conversation[];
      next_cursor?: string | null;
    };
    conversations.push(...(data.conversations ?? []));
    cursor = data.next_cursor ?? null;
  } while (cursor);
  return conversations;
}

export async function loadConversation(
  fetchClient: FetchClient,
  conversationId: string,
  useCase: UseCaseId,
) {
  const response = await fetchClient(
    `${conversationsEndpoint}/${conversationId}?use_case=${encodeURIComponent(useCase)}`,
    {},
    { label: "Load conversation", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Failed to load conversation."),
    );
  }
  return (await response.json()) as {
    conversation: Conversation;
    messages?: StoredMessage[];
  };
}

export async function deleteConversation(
  fetchClient: FetchClient,
  conversationId: string,
) {
  const response = await fetchClient(
    `${conversationsEndpoint}/${conversationId}`,
    { method: "DELETE" },
    { label: "Delete conversation", responseKind: "json" },
  );
  return response.ok;
}
