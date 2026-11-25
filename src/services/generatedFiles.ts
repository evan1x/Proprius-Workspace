import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:proprius.db";

export interface GeneratedFile {
  id: string;
  conversationId: string;
  messageId: string;
  name: string;
  language: string | null;
  content: string;
  createdAt: number;
}

interface GeneratedFileRow {
  id: string;
  conversation_id: string;
  message_id: string;
  name: string;
  language?: string | null;
  content: string;
  created_at: number;
}

export interface ExtractedGeneratedFile {
  name: string;
  language: string | null;
  content: string;
}

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

function mapFile(row: GeneratedFileRow): GeneratedFile {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    name: row.name,
    language: row.language ?? null,
    content: row.content,
    createdAt: row.created_at,
  };
}

function looksLikeFilename(token: string): boolean {
  const base = token.split("/").pop() ?? token;
  return /^[\w.-]+\.[a-z0-9]{1,8}$/i.test(base);
}

function filenameFromFenceInfo(info: string): {
  name: string;
  language: string | null;
} | null {
  const trimmed = info.trim();
  if (!trimmed) return null;

  const titleMatch = /(?:^|\s)title=["']?([^\s"']+)["']?/i.exec(trimmed);
  const tokens = trimmed.split(/\s+/);
  const named =
    titleMatch?.[1] ?? tokens.find((token) => looksLikeFilename(token));
  if (!named || !looksLikeFilename(named)) return null;

  const languageToken = tokens.find((token) => token !== named && !token.includes("="));
  return {
    name: named.replace(/\\/g, "/"),
    language: languageToken ?? null,
  };
}

/** Pull fenced code blocks that name a file, such as ```app.py or ```ts src/app.ts. */
export function extractGeneratedFiles(content: string): ExtractedGeneratedFile[] {
  const files: ExtractedGeneratedFile[] = [];
  const seen = new Set<string>();
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;

  for (const match of content.matchAll(fence)) {
    const parsed = filenameFromFenceInfo(match[1] ?? "");
    const body = (match[2] ?? "").replace(/\n$/, "");
    if (!parsed || !body.trim()) continue;
    if (seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    files.push({
      name: parsed.name,
      language: parsed.language,
      content: body,
    });
  }

  return files;
}

export async function listGeneratedFiles(): Promise<GeneratedFile[]> {
  const db = await getDb();
  const rows = await db.select<GeneratedFileRow[]>(
    `SELECT id, conversation_id, message_id, name, language, content, created_at
     FROM generated_files
     ORDER BY created_at DESC`,
  );
  return rows.map(mapFile);
}

/**
 * Replace the files recorded for one assistant message.
 * Returns the files now stored for that message.
 */
export async function replaceGeneratedFilesForMessage(
  conversationId: string,
  messageId: string,
  files: ExtractedGeneratedFile[],
): Promise<GeneratedFile[]> {
  const db = await getDb();
  await db.execute("DELETE FROM generated_files WHERE message_id = $1", [
    messageId,
  ]);

  const createdAt = Date.now();
  const stored: GeneratedFile[] = [];
  for (const file of files) {
    const record: GeneratedFile = {
      id: crypto.randomUUID(),
      conversationId,
      messageId,
      name: file.name,
      language: file.language,
      content: file.content,
      createdAt,
    };
    await db.execute(
      `INSERT INTO generated_files (
         id, conversation_id, message_id, name, language, content, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.id,
        record.conversationId,
        record.messageId,
        record.name,
        record.language,
        record.content,
        record.createdAt,
      ],
    );
    stored.push(record);
  }

  return stored;
}

export async function deleteGeneratedFile(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM generated_files WHERE id = $1", [id]);
}
