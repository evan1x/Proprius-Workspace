import { homeDir, join } from "@tauri-apps/api/path";
import type { ChatMessage } from "../types/chat";

export const OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_MODEL = "llama3.2:3b";

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
