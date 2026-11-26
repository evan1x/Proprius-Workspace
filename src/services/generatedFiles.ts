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

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: "py",
  py: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  rust: "rs",
  rs: "rs",
  go: "go",
  java: "java",
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  csharp: "cs",
  cs: "cs",
  html: "html",
  css: "css",
  json: "json",
  markdown: "md",
  md: "md",
  shell: "sh",
  sh: "sh",
  bash: "sh",
  sql: "sql",
  ruby: "rb",
  rb: "rb",
  php: "php",
  yaml: "yml",
  yml: "yml",
  toml: "toml",
  xml: "xml",
  text: "txt",
  plaintext: "txt",
  txt: "txt",
};

function looksLikeFilename(token: string): boolean {
  const base = token.split("/").pop() ?? token;
  return /^[\w.-]+\.[a-z0-9]{1,8}$/i.test(base);
}

function extensionFor(language: string | null): string {
  if (!language) return "txt";
  const key = language.toLowerCase();
  if (LANGUAGE_EXTENSIONS[key]) return LANGUAGE_EXTENSIONS[key];
  if (/^[a-z0-9+-]{1,8}$/i.test(key)) return key.replace("+", "p");
  return "txt";
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let next = `${stem}-${index}${ext}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem}-${index}${ext}`;
  }
  used.add(next);
  return next;
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

function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/g, "");
}

function slugFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const slug = kebab(title);
  if (!slug || slug === "new-chat") return null;
  return slug;
}

const SKIP_SYMBOLS = new Set([
  "main",
  "init",
  "setup",
  "index",
  "test",
  "app",
  "program",
]);

function usableSymbol(name: string | undefined): string | null {
  if (!name || name.startsWith("_")) return null;
  if (SKIP_SYMBOLS.has(name.toLowerCase())) return null;
  const stem = kebab(name);
  return stem.length >= 2 ? stem : null;
}

/** A function or type name from the code, when one is obvious. */
function symbolFromCode(body: string): string | null {
  const patterns = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/m,
    /^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)/m,
    /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/m,
    /^\s*def\s+([A-Za-z_]\w*)/m,
    /^\s*func\s+(?:\(\s*[A-Za-z_]\w*\s*\)\s+)?([A-Za-z_]\w*)/m,
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+([A-Za-z_]\w*)/m,
    /^\s*(?:struct|interface|enum|type)\s+([A-Za-z_]\w*)/m,
    /^\s*(?:[A-Za-z_][\w\s*]*?)\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/m,
  ];
  for (const pattern of patterns) {
    const stem = usableSymbol(body.match(pattern)?.[1]);
    if (stem) return stem;
  }
  return null;
}

function isGenericGeneratedName(name: string): boolean {
  return /^[a-z0-9+]{1,16}-\d+\.[a-z0-9]{1,8}$/i.test(name);
}

/** Pull every fenced code block. Named fences keep their filename. */
export function extractGeneratedFiles(
  content: string,
  chatTitle?: string,
): ExtractedGeneratedFile[] {
  const files: ExtractedGeneratedFile[] = [];
  const usedNames = new Set<string>();
  const fence = /(?:```|~~~)([^\n]*)\n([\s\S]*?)\n(?:```|~~~)[ \t]*(?:\n|$)/g;

  for (const match of content.matchAll(fence)) {
    const body = (match[2] ?? "").replace(/\n$/, "");
    if (!body.trim()) continue;

    const info = (match[1] ?? "").trim();
    const named = filenameFromFenceInfo(info);
    if (named) {
      files.push({
        name: uniqueName(named.name, usedNames),
        language: named.language,
        content: body,
      });
      continue;
    }

    const language = info.split(/\s+/).find((token) => token && !token.includes("=")) ?? null;
    const stem =
      symbolFromCode(body) ??
      slugFromTitle(chatTitle) ??
      (language ? kebab(language) : "snippet");
    files.push({
      name: uniqueName(`${stem}.${extensionFor(language)}`, usedNames),
      language,
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

async function existingFileRows(
  messageId: string,
): Promise<Array<{ id: string; name: string; content: string }>> {
  const db = await getDb();
  return db.select<Array<{ id: string; name: string; content: string }>>(
    `SELECT id, name, content FROM generated_files WHERE message_id = $1`,
    [messageId],
  );
}

/** Insert code blocks that are not already stored, and replace generic names. */
export async function ensureGeneratedFilesForMessage(
  conversationId: string,
  messageId: string,
  files: ExtractedGeneratedFile[],
): Promise<void> {
  if (files.length === 0) return;
  const db = await getDb();
  const rows = await existingFileRows(messageId);
  const createdAt = Date.now();
  const usedNames = new Set(rows.map((row) => row.name));

  for (const file of files) {
    const sameContent = rows.find((row) => row.content === file.content);
    if (sameContent) {
      if (
        isGenericGeneratedName(sameContent.name) &&
        sameContent.name !== file.name
      ) {
        const nextName = uniqueName(file.name, new Set(
          [...usedNames].filter((name) => name !== sameContent.name),
        ));
        await db.execute("UPDATE generated_files SET name = $1 WHERE id = $2", [
          nextName,
          sameContent.id,
        ]);
        usedNames.delete(sameContent.name);
        usedNames.add(nextName);
        sameContent.name = nextName;
      }
      continue;
    }

    const name = uniqueName(file.name, usedNames);
    await db.execute(
      `INSERT INTO generated_files (
         id, conversation_id, message_id, name, language, content, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        conversationId,
        messageId,
        name,
        file.language,
        file.content,
        createdAt,
      ],
    );
  }
}

/** Backfill every assistant code block already saved in chats. */
export async function syncGeneratedFilesFromConversations(
  conversations: Array<{
    id: string;
    title?: string;
    messages: Array<{ id: string; role: string; content: string }>;
  }>,
): Promise<GeneratedFile[]> {
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.role !== "assistant") continue;
      if (!message.content.includes("```") && !message.content.includes("~~~")) {
        continue;
      }
      const extracted = extractGeneratedFiles(message.content, conversation.title);
      if (extracted.length === 0) continue;
      await ensureGeneratedFilesForMessage(
        conversation.id,
        message.id,
        extracted,
      );
    }
  }
  return listGeneratedFiles();
}
