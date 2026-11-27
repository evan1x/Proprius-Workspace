import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:proprius.db";
const SESSION_KEY = "proprius.session.v1";
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin";
const PBKDF2_ITERATIONS = 120_000;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export interface Account {
  id: string;
  username: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

let dbPromise: Promise<Database> | null = null;
let activeUserId: string | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export function currentUserId(): string {
  if (!activeUserId) {
    throw new Error("Sign in to continue.");
  }
  return activeUserId;
}

export function setActiveUser(account: Account | null): void {
  activeUserId = account?.id ?? null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hashPassword(
  password: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(
    new Uint8Array(new ArrayBuffer(16)),
  ),
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationsRaw || !saltHex || !hashHex) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  if (saltHex.length % 2 !== 0 || hashHex.length % 2 !== 0) return false;

  const actual = await hashPassword(password, hexToBytes(saltHex), iterations);
  const actualHash = actual.split("$")[3] ?? "";
  if (actualHash.length !== hashHex.length) return false;

  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash.charCodeAt(index) ^ hashHex.charCodeAt(index);
  }
  return difference === 0;
}

function readStoredSession(): Account | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (!parsed.id || !parsed.username) return null;
    return { id: parsed.id, username: parsed.username };
  } catch {
    return null;
  }
}

function writeStoredSession(account: Account | null): void {
  if (!account) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: account.id, username: account.username }),
  );
}

/**
 * Create the built-in admin account and attach older chats and folders to it.
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const db = await getDb();
  const existing = await db.select<UserRow[]>(
    "SELECT id, username, password_hash FROM users WHERE username = $1",
    [ADMIN_USERNAME],
  );

  let adminId = existing[0]?.id;
  if (!adminId) {
    adminId = ADMIN_ID;
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await db.execute(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      [adminId, ADMIN_USERNAME, passwordHash, Date.now()],
    );
  }

  await db.execute(
    "UPDATE conversations SET user_id = $1 WHERE user_id IS NULL OR user_id = ''",
    [adminId],
  );
  await db.execute(
    "UPDATE folders SET user_id = $1 WHERE user_id IS NULL OR user_id = ''",
    [adminId],
  );
}

export async function signIn(
  username: string,
  password: string,
): Promise<Account> {
  const trimmed = username.trim();
  if (!trimmed || !password) {
    throw new Error("Enter a username and password.");
  }

  await ensureDefaultAdmin();
  const db = await getDb();
  const rows = await db.select<UserRow[]>(
    "SELECT id, username, password_hash FROM users WHERE username = $1",
    [trimmed],
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new Error("Username or password is incorrect.");
  }

  const account = { id: row.id, username: row.username };
  setActiveUser(account);
  writeStoredSession(account);
  return account;
}

export async function createAccount(
  username: string,
  password: string,
): Promise<Account> {
  const trimmed = username.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error(
      "Usernames are 3–32 characters: letters, numbers, underscores, or hyphens.",
    );
  }
  if (password.length < 4 || password.length > 128) {
    throw new Error("Passwords must be 4–128 characters.");
  }

  await ensureDefaultAdmin();
  const db = await getDb();
  const existing = await db.select<Array<{ id: string }>>(
    "SELECT id FROM users WHERE username = $1",
    [trimmed],
  );
  if (existing.length > 0) {
    throw new Error("That username is already taken.");
  }

  const account = { id: crypto.randomUUID(), username: trimmed };
  await db.execute(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, $3, $4)`,
    [account.id, account.username, await hashPassword(password), Date.now()],
  );
  setActiveUser(account);
  writeStoredSession(account);
  return account;
}

export async function restoreSession(): Promise<Account | null> {
  await ensureDefaultAdmin();
  const stored = readStoredSession();
  if (!stored) {
    setActiveUser(null);
    return null;
  }

  const db = await getDb();
  const rows = await db.select<Array<{ id: string; username: string }>>(
    "SELECT id, username FROM users WHERE id = $1",
    [stored.id],
  );
  const row = rows[0];
  if (!row) {
    writeStoredSession(null);
    setActiveUser(null);
    return null;
  }

  const account = { id: row.id, username: row.username };
  setActiveUser(account);
  writeStoredSession(account);
  return account;
}

export function signOut(): void {
  writeStoredSession(null);
  setActiveUser(null);
}
