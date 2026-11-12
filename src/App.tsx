import { useEffect, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import {
  ModelSelector,
  type ExternalPullRequest,
} from "./components/ModelSelector";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import {
  createEmptyConversation,
  deleteConversation,
  listConversations,
  saveMessage,
} from "./services/conversations";
import {
  DEFAULT_MODEL,
  checkOllamaStatus,
  generateResponse,
  listInstalledModels,
  type InstalledModel,
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

function sortByUpdatedAt(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [externalPullRequest, setExternalPullRequest] =
    useState<ExternalPullRequest | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      try {
        const stored = await listConversations();
        if (cancelled) return;

        if (stored.length > 0) {
          setConversations(stored);
          setActiveId(stored[0].id);
        } else {
          const conversation = createEmptyConversation();
          setConversations([conversation]);
          setActiveId(conversation.id);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load saved conversations.";
        setError(message);
        const conversation = createEmptyConversation();
        setConversations([conversation]);
        setActiveId(conversation.id);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!settingsOpen && !modelsOpen) return;

    let cancelled = false;

    async function refreshInstalled() {
      try {
        const installed = await listInstalledModels();
        if (!cancelled) setInstalledModels(installed);
      } catch {
        // Keep last known list; Settings install labels are best-effort.
      }
    }

    void refreshInstalled();

    return () => {
      cancelled = true;
    };
  }, [settingsOpen, modelsOpen]);

  function handleNewChat() {
    const conversation = createEmptyConversation();
    setConversations((prev) => [
      conversation,
      ...prev.filter((item) => item.messages.length > 0),
    ]);
    setActiveId(conversation.id);
    setError(null);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setError(null);
  }

  async function handleDelete(id: string) {
    setError(null);

    const remaining = conversations.filter((conversation) => conversation.id !== id);
    const wasActive = activeId === id;

    let nextActiveId = activeId;
    let nextConversations = remaining;

    if (wasActive) {
      if (remaining.length > 0) {
        nextActiveId = remaining[0].id;
      } else {
        const conversation = createEmptyConversation();
        nextConversations = [conversation];
        nextActiveId = conversation.id;
      }
    }

    setConversations(nextConversations);
    setActiveId(nextActiveId);

    try {
      await deleteConversation(id);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to delete conversation from storage.";
      setError(message);
      try {
        const stored = await listConversations();
        if (stored.length > 0) {
          setConversations(stored);
          setActiveId(
            wasActive
              ? stored[0].id
              : stored.some((conversation) => conversation.id === activeId)
                ? activeId
                : stored[0].id,
          );
        }
      } catch {
        // Keep optimistic UI if reload also fails.
      }
    }
  }

  async function handleSend(prompt: string) {
    setError(null);

    let conversationId = activeId;
    let priorMessages: ChatMessage[] = [];
    let currentTitle = "New chat";

    if (!conversationId) {
      const conversation = createEmptyConversation();
      conversationId = conversation.id;
      currentTitle = conversation.title;
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
    } else {
      const existing = conversations.find(
        (conversation) => conversation.id === conversationId,
      );
      priorMessages = existing?.messages ?? [];
      currentTitle = existing?.title ?? "New chat";
    }

    const userMessage = createMessage("user", prompt);
    const nextMessages = [...priorMessages, userMessage];
    const isFirstMessage = priorMessages.length === 0;
    const nextTitle = isFirstMessage
      ? titleFromPrompt(prompt)
      : currentTitle;
    const updatedAt = Date.now();

    setConversations((prev) =>
      sortByUpdatedAt(
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: nextTitle,
                updatedAt,
                messages: nextMessages,
              }
            : conversation,
        ),
      ),
    );

    try {
      await saveMessage(conversationId, userMessage, nextTitle);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save your message.";
      setError(message);
      return;
    }

    setIsGenerating(true);

    try {
      const reply = await generateResponse(nextMessages, model);
      const assistantMessage = createMessage("assistant", reply);
      const assistantUpdatedAt = Date.now();

      setConversations((prev) =>
        sortByUpdatedAt(
          prev.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: assistantUpdatedAt,
                  messages: [...conversation.messages, assistantMessage],
                }
              : conversation,
          ),
        ),
      );

      await saveMessage(conversationId, assistantMessage);
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
        settingsOpen={settingsOpen}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onDelete={(id) => {
          void handleDelete(id);
        }}
        onOpenSettings={() => {
          setSettingsOpen((current) => {
            const next = !current;
            if (next) setModelsOpen(false);
            return next;
          });
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-paper px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
                Proprius Workspace
              </h1>
              <p className="mt-1 truncate text-sm text-ink-muted">
                {isLoading
                  ? "Loading conversations…"
                  : activeConversation
                    ? activeConversation.title
                    : "No conversation selected"}
              </p>
            </div>
            <button
              type="button"
              disabled={isGenerating || isLoading}
              aria-expanded={modelsOpen}
              aria-controls="models-side-panel"
              onClick={() =>
                setModelsOpen((current) => {
                  const next = !current;
                  if (next) setSettingsOpen(false);
                  return next;
                })
              }
              className="group shrink-0 border border-line bg-panel px-3 py-2 text-right transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                Model
              </p>
              <p className="mt-0.5 flex items-center justify-end gap-2 text-xs font-medium tracking-wide text-ink">
                <span className="max-w-[9rem] truncate">{model}</span>
                <span aria-hidden="true" className="text-ink-muted">
                  {modelsOpen ? "›" : "‹"}
                </span>
              </p>
            </button>
          </div>
          <p className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-muted">
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                ollamaStatus?.ok && ollamaStatus.modelAvailable
                  ? "bg-ink"
                  : "bg-ink-muted"
              }`}
            />
            {connectionLabel}
          </p>
        </header>

        <ChatWindow messages={messages} isGenerating={isGenerating} />

        {error && (
          <div className="px-5 pb-2 md:px-8">
            <p className="mx-auto max-w-3xl border border-line bg-surface px-3 py-2 text-sm text-ink">
              {error}
            </p>
          </div>
        )}

        <ChatInput
          disabled={isGenerating || isLoading}
          onSend={handleSend}
        />
      </div>

      <ModelSelector
        open={modelsOpen}
        model={model}
        disabled={isGenerating || isLoading}
        onClose={() => setModelsOpen(false)}
        onChange={setModel}
        externalPullRequest={externalPullRequest}
        onExternalPullRequestHandled={() => setExternalPullRequest(null)}
        onModelsChange={(installed) => {
          setInstalledModels(installed);
          if (
            installed.length > 0 &&
            !installed.some((entry) => entry.name === model)
          ) {
            setModel(installed[0].name);
          }
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        installedModelNames={installedModels.map((entry) => entry.name)}
        onInstallSuggestion={(request) => {
          setSettingsOpen(false);
          setModelsOpen(true);
          setExternalPullRequest({
            name: request.name,
            description: request.description,
          });
        }}
      />
    </div>
  );
}

export default App;
