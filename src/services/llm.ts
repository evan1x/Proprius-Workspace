import type { ChatMessage } from "../types/chat";

export const OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_MODEL = "llama3.2:3b";

export type OllamaStatus =
  | { ok: true; model: string; modelAvailable: boolean }
  | { ok: false; model: string; error: string };

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
  models?: Array<{ name?: string; model?: string }>;
}

function toOllamaMessages(messages: ChatMessage[]): OllamaChatMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

export async function checkOllamaStatus(
  model: string = DEFAULT_MODEL,
): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
    });

    if (!response.ok) {
      return {
        ok: false,
        model,
        error: `Ollama returned ${response.status}. Is the service running?`,
      };
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const names = (data.models ?? []).flatMap((entry) =>
      [entry.name, entry.model].filter((value): value is string => Boolean(value)),
    );
    const modelAvailable = names.some(
      (name) =>
        name === model ||
        name.startsWith(`${model}:`) ||
        name === model.replace(/:latest$/, ""),
    );

    return { ok: true, model, modelAvailable };
  } catch {
    return {
      ok: false,
      model,
      error: "Cannot reach Ollama at localhost:11434. Start Ollama and try again.",
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
