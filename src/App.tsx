import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChatInput, type ChatInputHandle } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { ModelParametersPanel } from "./components/ModelParametersPanel";
import {
  ModelSelector,
  type ExternalPullRequest,
} from "./components/ModelSelector";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  Sidebar,
  readSidebarCollapsed,
  saveSidebarCollapsed,
} from "./components/Sidebar";
import {
  loadModelParameters,
  saveModelParameters,
  type ModelParameters,
} from "./types/modelParams";
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
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
} from "./types/chat";

/** Below this width, Models/Settings overlay instead of splitting the chat. */
const OVERLAY_PANELS_BELOW = 1100;
/** Below this width, hide the conversations sidebar while a panel is open. */
const HIDE_SIDEBAR_WITH_PANEL_BELOW = 900;

function createMessage(
  role: ChatMessage["role"],
  content: string,
  attachments?: ChatAttachment[],
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

function titleFromPrompt(prompt: string, attachments: ChatAttachment[]): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed) {
    if (trimmed.length <= 42) return trimmed;
    return `${trimmed.slice(0, 42).trimEnd()}…`;
  }
  if (attachments.length === 1) return attachments[0].name;
  if (attachments.length > 1) return `${attachments.length} attachments`;
  return "New chat";
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
  const [parametersOpen, setParametersOpen] = useState(false);
  const [modelParameters, setModelParameters] = useState<ModelParameters>(
    loadModelParameters,
  );
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [externalPullRequest, setExternalPullRequest] =
    useState<ExternalPullRequest | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? OVERLAY_PANELS_BELOW : window.innerWidth,
  );
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsed());
  }, []);

  function handleToggleSidebarCollapse() {
    setSidebarCollapsed((current) => {
      const next = !current;
      saveSidebarCollapsed(next);
      return next;
    });
  }

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const sidePanelOpen = modelsOpen || settingsOpen || parametersOpen;
  const overlayPanels = viewportWidth < OVERLAY_PANELS_BELOW;
  const hideSidebar =
    sidePanelOpen && viewportWidth < HIDE_SIDEBAR_WITH_PANEL_BELOW;

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function hasFilePayload(event: DragEvent) {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).some(
      (type) => type === "Files" || type === "application/x-moz-file",
    );
  }

  function handleChatDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    if (chatInputRef.current?.canAcceptFiles()) {
      setIsDraggingFiles(true);
    }
  }

  function handleChatDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  function handleChatDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const canAccept = chatInputRef.current?.canAcceptFiles() ?? false;
    event.dataTransfer.dropEffect = canAccept ? "copy" : "none";
    if (canAccept) setIsDraggingFiles(true);
  }

  function handleChatDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    void chatInputRef.current?.addFiles(event.dataTransfer.files);
  }

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

  async function handleSend(prompt: string, attachments: ChatAttachment[] = []) {
    setError(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && attachments.length === 0) return;

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

    const userMessage = createMessage("user", trimmedPrompt, attachments);
    const nextMessages = [...priorMessages, userMessage];
    const isFirstMessage = priorMessages.length === 0;
    const nextTitle = isFirstMessage
      ? titleFromPrompt(trimmedPrompt, attachments)
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
      const reply = await generateResponse(
        nextMessages,
        model,
        modelParameters,
      );
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
    <div className="relative flex h-full min-w-0 overflow-hidden bg-paper">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        settingsOpen={settingsOpen}
        collapsed={sidebarCollapsed}
        hidden={hideSidebar}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onDelete={(id) => {
          void handleDelete(id);
        }}
        onToggleCollapse={handleToggleSidebarCollapse}
        onOpenSettings={() => {
          setSettingsOpen((current) => {
            const next = !current;
            if (next) {
              setModelsOpen(false);
              setParametersOpen(false);
            }
            return next;
          });
        }}
      />

      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        onDragEnter={handleChatDragEnter}
        onDragLeave={handleChatDragLeave}
        onDragOver={handleChatDragOver}
        onDrop={handleChatDrop}
      >
        {isDraggingFiles && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-ink bg-paper/80">
            <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink">
              Drop files to attach
            </p>
          </div>
        )}

        <header className="border-b border-line bg-paper px-3 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-ink sm:text-lg">
                Proprius Workspace
              </h1>
              <p className="mt-1 truncate text-xs text-ink-muted sm:text-sm">
                {isLoading
                  ? "Loading conversations…"
                  : activeConversation
                    ? activeConversation.title
                    : "No conversation selected"}
              </p>
            </div>
            <div className="flex shrink-0 items-stretch gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={isGenerating || isLoading}
                title="Model parameters"
                aria-label="Model parameters"
                aria-expanded={parametersOpen}
                aria-controls="model-parameters-panel"
                onClick={() =>
                  setParametersOpen((current) => {
                    const next = !current;
                    if (next) {
                      setModelsOpen(false);
                      setSettingsOpen(false);
                    }
                    return next;
                  })
                }
                className={`hidden border border-line px-3 py-2 text-left transition sm:block disabled:cursor-not-allowed disabled:opacity-40 ${
                  parametersOpen
                    ? "bg-ink text-paper"
                    : "bg-panel text-ink hover:bg-hover"
                }`}
              >
                <p
                  className={`text-[10px] uppercase tracking-[0.12em] ${
                    parametersOpen ? "text-paper/70" : "text-ink-muted"
                  }`}
                >
                  Settings
                </p>
                <p
                  className={`mt-0.5 text-xs font-medium tracking-wide ${
                    parametersOpen ? "text-paper" : "text-ink"
                  }`}
                >
                  Parameters
                </p>
              </button>
              <button
                type="button"
                disabled={isGenerating || isLoading}
                aria-expanded={modelsOpen}
                aria-controls="models-side-panel"
                onClick={() =>
                  setModelsOpen((current) => {
                    const next = !current;
                    if (next) {
                      setSettingsOpen(false);
                      setParametersOpen(false);
                    }
                    return next;
                  })
                }
                className="group border border-line bg-panel px-2.5 py-2 text-right transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 sm:px-3"
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                  Model
                </p>
                <p className="mt-0.5 flex items-center justify-end gap-2 text-xs font-medium tracking-wide text-ink">
                  <span className="max-w-[6.5rem] truncate sm:max-w-[9rem]">
                    {model}
                  </span>
                  <span aria-hidden="true" className="text-ink-muted">
                    {modelsOpen ? "›" : "‹"}
                  </span>
                </p>
              </button>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted sm:mt-2.5">
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                ollamaStatus?.ok && ollamaStatus.modelAvailable
                  ? "bg-ink"
                  : "bg-ink-muted"
              }`}
            />
            <span className="truncate">{connectionLabel}</span>
          </p>
        </header>

        <ChatWindow messages={messages} isGenerating={isGenerating} />

        {error && (
          <div className="px-3 pb-2 sm:px-5 md:px-8">
            <p className="mx-auto max-w-5xl border border-line bg-surface px-3 py-2 text-sm text-ink">
              {error}
            </p>
          </div>
        )}

        <ChatInput
          ref={chatInputRef}
          disabled={isGenerating || isLoading}
          onSend={handleSend}
        />
      </div>

      {overlayPanels && sidePanelOpen && (
        <button
          type="button"
          aria-label="Close side panel"
          className="absolute inset-0 z-20 bg-paper/60"
          onClick={() => {
            setModelsOpen(false);
            setSettingsOpen(false);
            setParametersOpen(false);
          }}
        />
      )}

      <ModelSelector
        open={modelsOpen}
        model={model}
        disabled={isGenerating || isLoading}
        overlay={overlayPanels}
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

      <ModelParametersPanel
        open={parametersOpen}
        overlay={overlayPanels}
        model={model}
        value={modelParameters}
        disabled={isGenerating || isLoading}
        onChange={(next) => {
          setModelParameters(next);
          saveModelParameters(next);
        }}
        onClose={() => setParametersOpen(false)}
      />

      <SettingsPanel
        open={settingsOpen}
        overlay={overlayPanels}
        onClose={() => setSettingsOpen(false)}
        installedModelNames={installedModels.map((entry) => entry.name)}
        onInstallSuggestion={(request) => {
          setSettingsOpen(false);
          setParametersOpen(false);
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
