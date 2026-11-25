import Database from "@tauri-apps/plugin-sql";
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  MessageRole,
} from "../types/chat";

const DB_URL = "sqlite:proprius.db";

interface ConversationRow {
  id: string;
  title: string;
  updated_at: number;
  folder_id?: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
  attachments_json?: string | null;
}

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export function createEmptyConversation(
  folderId: string | null = null,
): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
    folderId,
  };
}

function parseAttachments(raw: string | null | undefined): ChatAttachment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as ChatAttachment[];
  } catch {
    return undefined;
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  const attachments = parseAttachments(row.attachments_json);
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.created_at,
    ...(attachments ? { attachments } : {}),
  };
}

/**
 * Load all conversations with their messages, newest first.
 */
export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const conversationRows = await db.select<ConversationRow[]>(
    `SELECT id, title, updated_at, folder_id
     FROM conversations
     ORDER BY updated_at DESC`,
  );

  if (conversationRows.length === 0) {
    return [];
  }

  const messageRows = await db.select<MessageRow[]>(
    `SELECT id, conversation_id, role, content, created_at, attachments_json
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
    folderId: row.folder_id ?? null,
    messages: messagesByConversation.get(row.id) ?? [],
  }));
}

/**
 * Insert or update a conversation row.
 */
export async function upsertConversation(
  conversation: Pick<Conversation, "id" | "title" | "updatedAt" | "folderId">,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO conversations (id, title, updated_at, folder_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       updated_at = excluded.updated_at,
       folder_id = COALESCE(excluded.folder_id, conversations.folder_id)`,
    [
      conversation.id,
      conversation.title,
      conversation.updatedAt,
      conversation.folderId ?? null,
    ],
  );
}

/**
 * Persist a message. Creates the conversation row if needed.
 * Pass `title` when the conversation title should be set/updated.
 * Pass `folderId` so newly inserted chats keep their folder assignment.
 */
export async function saveMessage(
  conversationId: string,
  message: ChatMessage,
  title?: string,
  folderId?: string | null,
): Promise<void> {
  const db = await getDb();
  const updatedAt = Math.max(message.createdAt, Date.now());
  const attachmentsJson =
    message.attachments && message.attachments.length > 0
      ? JSON.stringify(message.attachments)
      : null;
  const nextTitle = title ?? "New chat";

  await db.execute(
    `INSERT INTO conversations (id, title, updated_at, folder_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET
       title = CASE
         WHEN $5 = 1 THEN excluded.title
         ELSE conversations.title
       END,
       updated_at = excluded.updated_at,
       folder_id = COALESCE(conversations.folder_id, excluded.folder_id)`,
    [
      conversationId,
      nextTitle,
      updatedAt,
      folderId ?? null,
      title !== undefined ? 1 : 0,
    ],
  );

  await db.execute(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, attachments_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       role = excluded.role,
       created_at = excluded.created_at,
       attachments_json = excluded.attachments_json`,
    [
      message.id,
      conversationId,
      message.role,
      message.content,
      message.createdAt,
      attachmentsJson,
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
  await db.execute("DELETE FROM generated_files WHERE conversation_id = $1", [
    conversationId,
  ]);
  await db.execute("DELETE FROM messages WHERE conversation_id = $1", [
    conversationId,
  ]);
  await db.execute("DELETE FROM conversations WHERE id = $1", [conversationId]);
}
