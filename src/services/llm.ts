import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import type { ChatMessage } from "../types/chat";

export const OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_MODEL = "llama3.2:3b";
export const OLLAMA_LIBRARY_URL = "https://ollama.com/library";

export type OllamaStatus =
  | { ok: true; model: string; modelAvailable: boolean }
  | { ok: false; model: string; error: string };

export interface InstalledModel {
  name: string;
  size: number;
  modifiedAt: string | null;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
}

/** Model card scraped from ollama.com/library or ollama.com/search. */
export interface LibraryModel {
  name: string;
  description: string;
  pullsLabel: string;
  /** Disk size for the default tag, formatted in GB (e.g. "2.0 GB"). */
  sizeLabel: string | null;
  sizes: string[];
  url: string;
}

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    modified_at?: string;
  }>;
}

interface OllamaPullEvent {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
}

function toOllamaMessages(messages: ChatMessage[]): OllamaChatMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

export function formatModelSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
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
 * Default Ollama models directory on this machine.
 */
export async function getModelsInstallPath(): Promise<string> {
  try {
    const home = await homeDir();
    return await join(home, ".ollama", "models");
  } catch {
    return "~/.ollama/models";
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCompactCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const thousands = count / 1_000;
    return `${thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(count);
}

function extractPullsLabel(cardHtml: string): string {
  const downloadsTitle = cardHtml.match(/title="([\d,]+)\s+downloads"/i);
  if (downloadsTitle) {
    const count = Number(downloadsTitle[1].replace(/,/g, ""));
    if (Number.isFinite(count)) return formatCompactCount(count);
  }

  const withPulls = cardHtml.match(
    />([\d.]+[KMB]?)<\/span>\s*<span[^>]*>\s*(?:&nbsp;)?Pulls/i,
  );
  if (withPulls) return withPulls[1];

  const compact = cardHtml.match(
    /title="[\d,]+\s+downloads"[\s\S]{0,240}?<span\s*>([^<]+)<\/span>/i,
  );
  if (compact) return compact[1].trim();

  return "";
}

/**
 * Parse model cards from ollama.com library or search HTML.
 */
export function parseOllamaLibraryHtml(html: string): LibraryModel[] {
  const models: LibraryModel[] = [];
  const seen = new Set<string>();
  const cardRe = /<a\s+href="\/library\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const rawName = decodeURIComponent(match[1]).trim();
    if (!rawName || rawName.includes("/") || seen.has(rawName)) continue;
    seen.add(rawName);

    const body = match[2];
    const descriptionMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descriptionMatch
      ? stripHtml(descriptionMatch[1])
      : "";
    const sizes = [
      ...body.matchAll(
        /bg-\[#ddf4ff\][^>]*>\s*([^<]+?)\s*<\/span>/gi,
      ),
    ].map((entry) => entry[1].trim().toLowerCase());

    models.push({
      name: rawName,
      description,
      pullsLabel: extractPullsLabel(body),
      sizeLabel: null,
      sizes: [...new Set(sizes)],
      url: `${OLLAMA_LIBRARY_URL}/${rawName}`,
    });
  }

  return models;
}

async function fetchOllamaHtml(path: string): Promise<string> {
  return invoke<string>("fetch_ollama_html", { path });
}

const librarySizeCache = new Map<string, string | null>();

/**
 * Convert a scraped Ollama size token into a GB label.
 */
export function formatLibrarySizeLabel(
  value: string,
  unit: string,
): string | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const normalized = unit.toUpperCase();
  if (normalized === "GB") {
    return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} GB`;
  }
  if (normalized === "MB") {
    const gigabytes = amount / 1024;
    if (gigabytes >= 0.1) {
      return `${gigabytes.toFixed(1)} GB`;
    }
    return `${Math.round(amount)} MB`;
  }
  if (normalized === "TB") {
    return `${(amount * 1024).toFixed(0)} GB`;
  }
  return null;
}

/**
 * Read the default tag disk size from an ollama.com model page.
 */
export function parseLibraryModelSizeLabel(html: string): string | null {
  const patterns = [
    />([\d.]+)\s*(GB|MB|TB)<\/p>/i,
    /([\d.]+)\s*(GB|MB|TB)\s*·/i,
    /([\d.]+)\s*(GB|MB|TB)\b/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const label = formatLibrarySizeLabel(match[1], match[2]);
    if (label) return label;
  }

  return null;
}

async function fetchLibraryModelSizeLabel(
  modelName: string,
): Promise<string | null> {
  if (librarySizeCache.has(modelName)) {
    return librarySizeCache.get(modelName) ?? null;
  }

  try {
    const html = await fetchOllamaHtml(
      `/library/${encodeURIComponent(modelName)}`,
    );
    const sizeLabel = parseLibraryModelSizeLabel(html);
    librarySizeCache.set(modelName, sizeLabel);
    return sizeLabel;
  } catch {
    librarySizeCache.set(modelName, null);
    return null;
  }
}

async function withLibrarySizeLabels(
  models: LibraryModel[],
): Promise<LibraryModel[]> {
  return Promise.all(
    models.map(async (model) => {
      if (model.sizeLabel) return model;
      const sizeLabel = await fetchLibraryModelSizeLabel(model.name);
      return { ...model, sizeLabel };
    }),
  );
}

/**
 * Popular models from https://ollama.com/library (site default order).
 */
export async function listPopularLibraryModels(
  limit = 12,
): Promise<LibraryModel[]> {
  const html = await fetchOllamaHtml("/library");
  const models = parseOllamaLibraryHtml(html).slice(0, limit);
  return withLibrarySizeLabels(models);
}

/**
 * Search models on https://ollama.com/search (popular sort).
 */
export async function searchLibraryModels(
  query: string,
  limit = 20,
): Promise<LibraryModel[]> {
  const q = query.trim();
  if (!q) return listPopularLibraryModels(limit);

  const path = `/search?q=${encodeURIComponent(q)}&o=popular`;
  const html = await fetchOllamaHtml(path);
  const models = parseOllamaLibraryHtml(html).slice(0, limit);
  return withLibrarySizeLabels(models);
}

/**
 * List models currently installed in the local Ollama runtime.
 */
export async function listInstalledModels(): Promise<InstalledModel[]> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: "GET" });
  } catch {
    throw new Error(
      "Cannot reach Ollama at localhost:11434. Make sure Ollama is running.",
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to list models (Ollama ${response.status}).`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  const models = (data.models ?? [])
    .map((entry) => {
      const name = entry.name ?? entry.model;
      if (!name) return null;
      return {
        name,
        size: entry.size ?? 0,
        modifiedAt: entry.modified_at ?? null,
      } satisfies InstalledModel;
    })
    .filter((entry): entry is InstalledModel => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return models;
}

/**
 * Pull a model from the Ollama registry. Reports streaming progress when provided.
 */
export async function pullModel(
  modelName: string,
  onProgress?: (progress: PullProgress) => void,
): Promise<void> {
  const name = modelName.trim();
  if (!name) {
    throw new Error("Enter a model name to pull (for example llama3.2:3b).");
  }

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
    });
  } catch {
    throw new Error(
      "Cannot reach Ollama at localhost:11434. Make sure Ollama is running.",
    );
  }

  if (!response.ok) {
    let detail = `Pull failed (Ollama ${response.status}).`;
    try {
      const body = (await response.json()) as OllamaPullEvent;
      if (body.error) detail = body.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty pull stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event: OllamaPullEvent;
      try {
        event = JSON.parse(trimmed) as OllamaPullEvent;
      } catch {
        continue;
      }

      if (event.error) {
        throw new Error(event.error);
      }

      const completed = event.completed;
      const total = event.total;
      const percent =
        typeof completed === "number" &&
        typeof total === "number" &&
        total > 0
          ? Math.min(100, Math.round((completed / total) * 100))
          : undefined;

      onProgress?.({
        status: event.status ?? "pulling",
        completed,
        total,
        percent,
      });
    }
  }
}

export async function checkOllamaStatus(
  model: string = DEFAULT_MODEL,
): Promise<OllamaStatus> {
  try {
    const models = await listInstalledModels();
    const modelAvailable = models.some(
      (entry) =>
        entry.name === model ||
        entry.name.startsWith(`${model}:`) ||
        entry.name === model.replace(/:latest$/, ""),
    );
    return { ok: true, model, modelAvailable };
  } catch (err) {
    return {
      ok: false,
      model,
      error:
        err instanceof Error
          ? err.message
          : "Cannot reach Ollama at localhost:11434. Start Ollama and try again.",
    };
  }
}

/**
 * Generate a reply from the local Ollama model using full chat history.
 */
export async function generateResponse(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const payload = {
    model,
    stream: false,
    messages: toOllamaMessages(messages),
  };

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Cannot reach Ollama at localhost:11434. Make sure Ollama is running.",
    );
  }

  if (!response.ok) {
    let detail = `Ollama request failed (${response.status}).`;
    try {
      const body = (await response.json()) as OllamaChatResponse;
      if (body.error) detail = body.error;
    } catch {
      // ignore parse errors
    }

    if (response.status === 404) {
      detail = `Model "${model}" was not found. Run: ollama pull ${model}`;
    }

    throw new Error(detail);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content?.trim();

  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
}
