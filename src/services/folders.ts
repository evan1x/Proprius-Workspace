import Database from "@tauri-apps/plugin-sql";
import type { Folder } from "../types/chat";
import {
  DEFAULT_FOLDER_COLOR,
  normalizeFolderColor,
  nextFolderColor,
  type FolderColorId,
} from "../types/folderColors";

const DB_URL = "sqlite:proprius.db";

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  sort_order: number;
  color?: string | null;
}

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    sortOrder: row.sort_order,
    color: normalizeFolderColor(row.color),
  };
}

export function createEmptyFolder(
  name = "New folder",
  color: FolderColorId = DEFAULT_FOLDER_COLOR,
): Folder {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "New folder",
    createdAt: Date.now(),
    sortOrder: Date.now(),
    color: normalizeFolderColor(color),
  };
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  const rows = await db.select<FolderRow[]>(
    `SELECT id, name, created_at, sort_order, color
     FROM folders
     ORDER BY sort_order ASC, created_at ASC`,
  );
  return rows.map(mapFolder);
}

export async function createFolder(
  name: string,
  existingCount = 0,
): Promise<Folder> {
  const folder = createEmptyFolder(name, nextFolderColor(existingCount));
  const db = await getDb();
  await db.execute(
    `INSERT INTO folders (id, name, created_at, sort_order, color)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      folder.id,
      folder.name,
      folder.createdAt,
      folder.sortOrder,
      folder.color,
    ],
  );
  return folder;
}

export async function renameFolder(
  folderId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim() || "New folder";
  const db = await getDb();
  await db.execute("UPDATE folders SET name = $1 WHERE id = $2", [
    trimmed,
    folderId,
  ]);
}

export async function setFolderColor(
  folderId: string,
  color: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE folders SET color = $1 WHERE id = $2", [
    normalizeFolderColor(color),
    folderId,
  ]);
}

/**
 * Deletes a folder and moves its conversations back to unfiled.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE conversations SET folder_id = NULL WHERE folder_id = $1",
    [folderId],
  );
  await db.execute("DELETE FROM folders WHERE id = $1", [folderId]);
}

export async function moveConversationToFolder(
  conversationId: string,
  folderId: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE conversations SET folder_id = $1 WHERE id = $2",
    [folderId, conversationId],
  );
}
