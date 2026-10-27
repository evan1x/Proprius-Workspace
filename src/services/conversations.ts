import type { Conversation } from "../types/chat";

/**
 * Conversation store helpers.
 * Replace with SQLite-backed persistence when the database layer is wired in.
 */
export function listConversations(): Conversation[] {
  return [];
}

export function createEmptyConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
}
