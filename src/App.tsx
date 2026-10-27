import { useEffect, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";
import { createEmptyConversation } from "./services/conversations";
import {
  DEFAULT_MODEL,
  checkOllamaStatus,
  generateResponse,
  type OllamaStatus,
} from "./services/llm";
import type { ChatMessage, Conversation } from "./types/chat";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
  };
}

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 42) return trimmed;
  return `${trimmed.slice(0, 42).trimEnd()}…`;
}

const initialConversation = createEmptyConversation();

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([
    initialConversation,
  ]);
  const [activeId, setActiveId] = useState<string | null>(initialConversation.id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model] = useState(DEFAULT_MODEL);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      const status = await checkOllamaStatus(model);
      if (!cancelled) setOllamaStatus(status);
    }

    void refreshStatus();
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [model]);

  function handleNewChat() {
    const conversation = createEmptyConversation();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setError(null);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setError(null);
  }

  async function handleSend(prompt: string) {
    setError(null);

    let conversationId = activeId;
    let priorMessages: ChatMessage[] = [];

    if (!conversationId) {
      const conversation = createEmptyConversation();
      conversationId = conversation.id;
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
    } else {
      priorMessages =
        conversations.find((conversation) => conversation.id === conversationId)
          ?.messages ?? [];
    }

    const userMessage = createMessage("user", prompt);
    const nextMessages = [...priorMessages, userMessage];
    const isFirstMessage = priorMessages.length === 0;

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: isFirstMessage
                ? titleFromPrompt(prompt)
                : conversation.title,
              updatedAt: Date.now(),
              messages: nextMessages,
            }
          : conversation,
      ),
    );

    setIsGenerating(true);

    try {
      const reply = await generateResponse(nextMessages, model);
      const assistantMessage = createMessage("assistant", reply);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: Date.now(),
                messages: [...conversation.messages, assistantMessage],
              }
            : conversation,
        ),
      );
      setOllamaStatus({ ok: true, model, modelAvailable: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate a response.";
      setError(message);
      const status = await checkOllamaStatus(model);
      setOllamaStatus(status);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleClear() {
    if (!activeId) return;
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              title: "New chat",
              updatedAt: Date.now(),
              messages: [],
            }
          : conversation,
      ),
    );
    setError(null);
  }

  const modelLabel = model;
  const connectionLabel = !ollamaStatus
    ? "Checking Ollama…"
    : ollamaStatus.ok
      ? ollamaStatus.modelAvailable
        ? "Ollama connected"
        : `Model missing — run ollama pull ${model}`
      : "Ollama offline";

  return (
    <div className="flex h-full bg-paper">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink uppercase">
                Proprius Workspace
              </h1>
              <p className="mt-0.5 truncate text-xs tracking-wide text-ink-muted uppercase">
                {activeConversation
                  ? activeConversation.title
                  : "No conversation selected"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="border border-line px-3 py-1.5 text-right">
                <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                  Model
                </p>
                <p className="text-xs font-medium uppercase tracking-wide text-ink">
                  {modelLabel}
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
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-ink-muted">
            {connectionLabel}
          </p>
        </header>

        <ChatWindow messages={messages} isGenerating={isGenerating} />

        {error && (
          <div className="px-4 pb-2">
            <p className="border border-line bg-paper px-3 py-2 text-sm text-ink">
              {error}
            </p>
          </div>
        )}

        <ChatInput disabled={isGenerating} onSend={handleSend} />
      </div>
    </div>
  );
}

export default App;
