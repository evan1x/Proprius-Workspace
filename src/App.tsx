import { useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { generateResponse } from "./services/llm";
import type { ChatMessage } from "./types/chat";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
  };
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(prompt: string) {
    setError(null);
    setMessages((prev) => [...prev, createMessage("user", prompt)]);
    setIsGenerating(true);

    try {
      const reply = await generateResponse(prompt);
      setMessages((prev) => [...prev, createMessage("assistant", reply)]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate a response.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="border-b border-line px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink uppercase">
              Proprius Workspace
            </h1>
            <p className="mt-0.5 text-xs tracking-wide text-ink-muted uppercase">
              Offline - No model connected
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={messages.length === 0 || isGenerating}
            className="border border-line bg-paper px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-paper disabled:hover:text-ink"
          >
            Clear
          </button>
        </div>
      </header>

      <ChatWindow messages={messages} isGenerating={isGenerating} />

      {error && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <p className="border border-line bg-paper px-3 py-2 text-sm text-ink">
            {error}
          </p>
        </div>
      )}

      <ChatInput disabled={isGenerating} onSend={handleSend} />
    </div>
  );
}

export default App;
