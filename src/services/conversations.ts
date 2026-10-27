import Database from "@tauri-apps/plugin-sql";
import type { ChatMessage, Conversation, MessageRole } from "../types/chat";

const DB_URL = "sqlite:proprius.db";

interface ConversationRow {
  id: string;
  title: string;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
}

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export function createEmptyConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Load all conversations with their messages, newest first.
 */
export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const conversationRows = await db.select<ConversationRow[]>(
    "SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC",
  );

  if (conversationRows.length === 0) {
    return [];
  }

  const messageRows = await db.select<MessageRow[]>(
    `SELECT id, conversation_id, role, content, created_at
     FROM messages
     ORDER BY created_at ASC`,
  );

  const messagesByConversation = new Map<string, ChatMessage[]>();
  for (const row of messageRows) {
    const existing = messagesByConversation.get(row.conversation_id) ?? [];
    existing.push(mapMessage(row));
    messagesByConversation.set(row.conversation_id, existing);
  }

  return conversationRows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    messages: messagesByConversation.get(row.id) ?? [],
  }));
}

/**
 * Insert or update a conversation row.
 */
export async function upsertConversation(
  conversation: Pick<Conversation, "id" | "title" | "updatedAt">,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO conversations (id, title, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       updated_at = excluded.updated_at`,
    [conversation.id, conversation.title, conversation.updatedAt],
  );
}

/**
 * Persist a message. Creates the conversation row if needed.
 * Pass `title` when the conversation title should be set/updated.
 */
export async function saveMessage(
  conversationId: string,
  message: ChatMessage,
  title?: string,
): Promise<void> {
  const db = await getDb();
  const updatedAt = Math.max(message.createdAt, Date.now());

  if (title !== undefined) {
    await db.execute(
      `INSERT INTO conversations (id, title, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         updated_at = excluded.updated_at`,
      [conversationId, title, updatedAt],
    );
  } else {
    await db.execute(
      `INSERT INTO conversations (id, title, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at`,
      [conversationId, "New chat", updatedAt],
    );
  }

  await db.execute(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       role = excluded.role,
       created_at = excluded.created_at`,
    [
      message.id,
      conversationId,
      message.role,
      message.content,
      message.createdAt,
    ],
  );
}

/**
 * Remove all messages for a conversation and reset its title.
 */
export async function clearConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE conversation_id = $1", [
    conversationId,
  ]);
  await db.execute(
    "UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3",
    ["New chat", Date.now(), conversationId],
  );
}

/**
 * Delete a conversation and all of its messages.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE conversation_id = $1", [
    conversationId,
  ]);
  await db.execute("DELETE FROM conversations WHERE id = $1", [conversationId]);
}
