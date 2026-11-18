import type { AttachmentKind, ChatAttachment } from "../types/chat";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "csv",
  "tsv",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "rs",
  "go",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sql",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "bat",
  "cmd",
  "log",
  "conf",
  "cfg",
  "gitignore",
  "dockerfile",
  "makefile",
  "r",
  "swift",
  "scala",
  "lua",
  "pl",
  "vue",
  "svelte",
  "astro",
]);

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base.toLowerCase();
  return base.slice(dot + 1).toLowerCase();
}

function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  let sample = bytes;
  if (sample.length > 4096) sample = sample.slice(0, 4096);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.08;
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return {
    text:
      text.slice(0, MAX_TEXT_CHARS) +
      `\n\n…[truncated: showing first ${MAX_TEXT_CHARS.toLocaleString()} characters]`,
    truncated: true,
  };
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error(`Failed to read "${file.name}".`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(file);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Naive PDF text scrape for simple documents (best-effort, no external deps).
 */
function extractPdfText(bytes: Uint8Array): string | null {
  const raw = decodeUtf8(bytes);
  if (!raw.startsWith("%PDF")) return null;

  const chunks: string[] = [];
  const parenRegex = /\((?:\\.|[^\\)]){2,}\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(raw)) !== null) {
    const inner = match[0].slice(1, -1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\(\d{3})/g, (_, oct) =>
        String.fromCharCode(Number.parseInt(oct, 8)),
      );
    if (/[A-Za-z0-9]/.test(decoded)) chunks.push(decoded);
  }

  const joined = chunks.join(" ").replace(/[ \t]+\n/g, "\n").trim();
  if (joined.length < 16) return null;
  return joined;
}

function classifyFile(file: File): AttachmentKind {
  const mime = (file.type || "").toLowerCase();
  const ext = extensionOf(file.name);

  if (IMAGE_MIME.has(mime) || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return "image";
  }

  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/x-yaml" ||
    mime === "application/toml" ||
    TEXT_EXTENSIONS.has(ext) ||
    ext === "pdf"
  ) {
    return "text";
  }

  return "binary";
}

export function formatAttachmentSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * Read a user-selected File into a ChatAttachment the model can consume.
 */
export async function readFileAsAttachment(file: File): Promise<ChatAttachment> {
  if (file.size <= 0) {
    throw new Error(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `"${file.name}" is too large (max ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}).`,
    );
  }

  const buffer = await readAsArrayBuffer(file);
  const bytes = new Uint8Array(buffer);
  const mimeType = file.type || "application/octet-stream";
  let kind = classifyFile(file);

  if (kind === "image") {
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType,
      size: file.size,
      kind: "image",
      dataBase64: arrayBufferToBase64(buffer),
    };
  }

  const ext = extensionOf(file.name);
  if (ext === "pdf" || mimeType === "application/pdf") {
    const pdfText = extractPdfText(bytes);
    if (pdfText) {
      const { text } = truncateText(pdfText);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: mimeType || "application/pdf",
        size: file.size,
        kind: "text",
        textContent: text,
      };
    }
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: mimeType || "application/pdf",
      size: file.size,
      kind: "binary",
      textContent:
        "PDF text could not be extracted automatically. Ask the user for a text export or paste key excerpts.",
    };
  }

  if (kind === "text" || isProbablyText(bytes)) {
    const { text } = truncateText(decodeUtf8(bytes));
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType,
      size: file.size,
      kind: "text",
      textContent: text,
    };
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType,
    size: file.size,
    kind: "binary",
    textContent: `Binary file "${file.name}" (${mimeType}, ${formatAttachmentSize(file.size)}). Content could not be decoded as text.`,
  };
}
