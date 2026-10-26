import type { Conversation } from "../types/chat";

/**
 * Placeholder conversation store.
 * Replace with SQLite-backed persistence when the database layer is wired in.
 */
const PLACEHOLDER_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1",
    title: "Test conversation",
    updatedAt: Date.now() - 1000 * 60 * 30,
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Test question?",
        createdAt: Date.now() - 1000 * 60 * 32,
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Test conversation response (placeholder).\n\n Response goes here",
        createdAt: Date.now() - 1000 * 60 * 31,
      },
    ],
  },
  {
    id: "conv-2",
    title: "Test conversation 2",
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    messages: [
      {
        id: "m3",
        role: "user",
        content: "Test question 2?",
        createdAt: Date.now() - 1000 * 60 * 60 * 5,
      },
      {
        id: "m4",
        role: "assistant",
        content:
          "Test conversation response (placeholder).\n\n Response goes here",
        createdAt: Date.now() - 1000 * 60 * 60 * 5 + 1000,
      },
    ],
  },
  {
    id: "conv-3",
    title: "Test conversation 3",
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    messages: [
      {
        id: "m5",
        role: "user",
        content: "Test question 3?",
        createdAt: Date.now() - 1000 * 60 * 60 * 24,
      },
      {
        id: "m6",
        role: "assistant",
        content:
          "Test conversation response (placeholder).\n\n Response goes here",
        createdAt: Date.now() - 1000 * 60 * 60 * 24 + 1000,
      },
    ],
  },
];

export function listConversations(): Conversation[] {
  return PLACEHOLDER_CONVERSATIONS.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
  }));
}

export function createEmptyConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
}
