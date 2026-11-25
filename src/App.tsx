import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChatInput, type ChatInputHandle } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { ModelParametersPanel } from "./components/ModelParametersPanel";
import {
  ModelSelector,
  type ExternalPullRequest,
} from "./components/ModelSelector";
import { SettingsPanel } from "./components/SettingsPanel";
import { applyTheme, loadTheme, saveTheme, type ThemeMode } from "./services/theme";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
} from "./services/uiScale";
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
  createFolder,
  deleteFolder,
  listFolders,
  moveConversationToFolder,
  renameFolder,
  setFolderColor,
} from "./services/folders";
import {
  deleteGeneratedFile,
  extractGeneratedFiles,
  listGeneratedFiles,
  replaceGeneratedFilesForMessage,
  type GeneratedFile,
} from "./services/generatedFiles";
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
  Folder,
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
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
  const [uiScale, setUiScale] = useState(loadUiScale);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const dragDepthRef = useRef(0);
  const conversationsRef = useRef(conversations);
  const activeIdRef = useRef(activeId);
  const modelRef = useRef(model);
  const modelParametersRef = useRef(modelParameters);
  const generationQueueRef = useRef(Promise.resolve());
  const pendingGenerationsRef = useRef(0);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    conversationsRef.current = conversations;
    activeIdRef.current = activeId;
    modelRef.current = model;
    modelParametersRef.current = modelParameters;
  }, [conversations, activeId, model, modelParameters]);

  function commitConversations(
    updater: (prev: Conversation[]) => Conversation[],
  ) {
    setConversations((prev) => {
      const next = updater(prev);
      conversationsRef.current = next;
      return next;
    });
  }

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
        const [stored, storedFolders] = await Promise.all([
          listConversations(),
          listFolders(),
        ]);
        if (cancelled) return;

        setFolders(storedFolders);
        try {
          const storedFiles = await listGeneratedFiles();
          if (!cancelled) setGeneratedFiles(storedFiles);
        } catch {
          // The files table arrives with the next app launch.
        }

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

  function handleNewChat(folderId: string | null = null) {
    const conversation = createEmptyConversation(folderId);
    setConversations((prev) => [
      conversation,
      ...prev.filter((item) => item.messages.length > 0),
    ]);
    setActiveId(conversation.id);
    setError(null);
  }

  async function handleNewFolder(): Promise<Folder | null> {
    setError(null);
    try {
      const folder = await createFolder("New folder", folders.length);
      setFolders((prev) => [...prev, folder]);
      return folder;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create folder.",
      );
      return null;
    }
  }

  async function handleRenameFolder(folderId: string, name: string) {
    setError(null);
    const previous = folders;
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, name } : folder,
      ),
    );
    try {
      await renameFolder(folderId, name);
    } catch (err) {
      setFolders(previous);
      setError(
        err instanceof Error ? err.message : "Failed to rename folder.",
      );
    }
  }

  async function handleSetFolderColor(folderId: string, color: string) {
    setError(null);
    const previous = folders;
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, color } : folder,
      ),
    );
    try {
      await setFolderColor(folderId, color);
    } catch (err) {
      setFolders(previous);
      setError(
        err instanceof Error ? err.message : "Failed to update folder color.",
      );
    }
  }

  async function handleDeleteFolder(folderId: string) {
    setError(null);
    const previousFolders = folders;
    const previousConversations = conversations;
    setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.folderId === folderId
          ? { ...conversation, folderId: null }
          : conversation,
      ),
    );
    try {
      await deleteFolder(folderId);
    } catch (err) {
      setFolders(previousFolders);
      setConversations(previousConversations);
      setError(
        err instanceof Error ? err.message : "Failed to delete folder.",
      );
    }
  }

  async function handleMoveConversation(
    conversationId: string,
    folderId: string | null,
  ) {
    setError(null);
    const previous = conversations;
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, folderId }
          : conversation,
      ),
    );
    try {
      await moveConversationToFolder(conversationId, folderId);
    } catch (err) {
      setConversations(previous);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to move conversation.",
      );
    }
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
    setGeneratedFiles((current) =>
      current.filter((file) => file.conversationId !== id),
    );
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

  function enqueueGeneration(task: () => Promise<void>) {
    pendingGenerationsRef.current += 1;
    setIsGenerating(true);
    generationQueueRef.current = generationQueueRef.current
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        pendingGenerationsRef.current -= 1;
        if (pendingGenerationsRef.current === 0) {
          setIsGenerating(false);
          setStreamingMessageId(null);
        }
      });
  }

  async function handleSend(prompt: string, attachments: ChatAttachment[] = []) {
    setError(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && attachments.length === 0) return;

    const userMessage = createMessage("user", trimmedPrompt, attachments);
    let conversationId = activeIdRef.current;
    let created: Conversation | null = null;

    if (!conversationId) {
      created = createEmptyConversation();
      conversationId = created.id;
      activeIdRef.current = conversationId;
      setActiveId(conversationId);
    }

    const targetId = conversationId;
    const existingNow = conversationsRef.current.find(
      (conversation) => conversation.id === targetId,
    );
    const folderId = existingNow?.folderId ?? created?.folderId ?? null;
    const nextTitle =
      (existingNow?.messages.length ?? 0) === 0
        ? titleFromPrompt(trimmedPrompt, attachments)
        : (existingNow?.title ?? created?.title ?? "New chat");

    commitConversations((prev) => {
      const existing = prev.find((conversation) => conversation.id === targetId);
      const priorMessages = existing?.messages ?? [];
      const title =
        priorMessages.length === 0
          ? titleFromPrompt(trimmedPrompt, attachments)
          : (existing?.title ?? nextTitle);

      const updated: Conversation = {
        ...(existing ?? created!),
        title,
        updatedAt: Date.now(),
        folderId: existing?.folderId ?? folderId,
        messages: [...priorMessages, userMessage],
      };

      return sortByUpdatedAt([
        updated,
        ...prev.filter((conversation) => conversation.id !== targetId),
      ]);
    });

    try {
      await saveMessage(targetId, userMessage, nextTitle, folderId);
    } catch (err) {
      commitConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === targetId
            ? {
                ...conversation,
                messages: conversation.messages.filter(
                  (message) => message.id !== userMessage.id,
                ),
              }
            : conversation,
        ),
      );
      const message =
        err instanceof Error ? err.message : "Failed to save your message.";
      setError(message);
      return;
    }

    enqueueGeneration(() =>
      generateForMessage(targetId, userMessage.id, folderId),
    );
  }

  async function generateForMessage(
    conversationId: string,
    userMessageId: string,
    folderId: string | null,
  ) {
    const conversation = conversationsRef.current.find(
      (entry) => entry.id === conversationId,
    );
    const historyEnd = conversation?.messages.findIndex(
      (message) => message.id === userMessageId,
    );
    if (!conversation || historyEnd === undefined || historyEnd < 0) return;

    const history = conversation.messages
      .slice(0, historyEnd + 1)
      .filter(
        (message) => message.role === "user" || message.content.trim().length > 0,
      );

    const assistantMessage = createMessage("assistant", "");
    setStreamingMessageId(assistantMessage.id);
    commitConversations((prev) =>
      prev.map((entry) => {
        if (entry.id !== conversationId) return entry;
        const insertAt = entry.messages.findIndex(
          (message) => message.id === userMessageId,
        );
        if (insertAt < 0) return entry;
        const messages = [...entry.messages];
        messages.splice(insertAt + 1, 0, assistantMessage);
        return { ...entry, messages };
      }),
    );

    const activeModel = modelRef.current;

    try {
      const reply = await generateResponse(
        history,
        activeModel,
        modelParametersRef.current,
        (content) => {
          commitConversations((prev) =>
            prev.map((entry) =>
              entry.id === conversationId
                ? {
                    ...entry,
                    messages: entry.messages.map((message) =>
                      message.id === assistantMessage.id
                        ? { ...message, content }
                        : message,
                    ),
                  }
                : entry,
            ),
          );
        },
      );
      const finishedMessage: ChatMessage = {
        ...assistantMessage,
        content: reply,
      };

      commitConversations((prev) =>
        sortByUpdatedAt(
          prev.map((entry) =>
            entry.id === conversationId
              ? {
                  ...entry,
                  updatedAt: Date.now(),
                  messages: entry.messages.map((message) =>
                    message.id === assistantMessage.id
                      ? finishedMessage
                      : message,
                  ),
                }
              : entry,
          ),
        ),
      );

      await saveMessage(conversationId, finishedMessage, undefined, folderId);
      const recorded = await replaceGeneratedFilesForMessage(
        conversationId,
        finishedMessage.id,
        extractGeneratedFiles(reply),
      );
      setGeneratedFiles((current) => [
        ...recorded,
        ...current.filter((file) => file.messageId !== finishedMessage.id),
      ]);
      setOllamaStatus({ ok: true, model: activeModel, modelAvailable: true });
    } catch (err) {
      commitConversations((prev) =>
        prev.map((entry) =>
          entry.id === conversationId
            ? {
                ...entry,
                messages: entry.messages.filter(
                  (message) => message.id !== assistantMessage.id,
                ),
              }
            : entry,
        ),
      );
      const message =
        err instanceof Error ? err.message : "Failed to generate a response.";
      setError(message);
      const status = await checkOllamaStatus(activeModel);
      setOllamaStatus(status);
    } finally {
      setStreamingMessageId((current) =>
        current === assistantMessage.id ? null : current,
      );
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
        folders={folders}
        generatedFiles={generatedFiles}
        activeId={activeId}
        settingsOpen={settingsOpen}
        collapsed={sidebarCollapsed}
        hidden={hideSidebar}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onDelete={(id) => {
          void handleDelete(id);
        }}
        onNewFolder={handleNewFolder}
        onRenameFolder={(folderId, name) => {
          void handleRenameFolder(folderId, name);
        }}
        onSetFolderColor={(folderId, color) => {
          void handleSetFolderColor(folderId, color);
        }}
        onDeleteFolder={(folderId) => {
          void handleDeleteFolder(folderId);
        }}
        onMoveConversation={(conversationId, folderId) => {
          void handleMoveConversation(conversationId, folderId);
        }}
        onToggleCollapse={handleToggleSidebarCollapse}
        onDeleteGeneratedFile={(fileId) => {
          setGeneratedFiles((current) =>
            current.filter((file) => file.id !== fileId),
          );
          void deleteGeneratedFile(fileId).catch((err) => {
            setError(
              err instanceof Error
                ? err.message
                : "Failed to delete generated file.",
            );
          });
        }}
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

        <header className="border-b border-line bg-paper px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">
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
                className={`group border border-line px-2.5 py-2 text-right transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 ${
                  modelsOpen
                    ? "bg-ink text-paper"
                    : "bg-panel text-ink hover:bg-hover"
                }`}
              >
                <p
                  className={`text-[10px] uppercase tracking-[0.12em] ${
                    modelsOpen ? "text-paper/70" : "text-ink-muted"
                  }`}
                >
                  Model
                </p>
                <p
                  className={`mt-0.5 flex items-center justify-end gap-2 text-xs font-medium tracking-wide ${
                    modelsOpen ? "text-paper" : "text-ink"
                  }`}
                >
                  <span className="max-w-[6.5rem] truncate sm:max-w-[9rem]">
                    {model}
                  </span>
                  <span
                    aria-hidden="true"
                    className={modelsOpen ? "text-paper/70" : "text-ink-muted"}
                  >
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

        <ChatWindow
          messages={messages}
          isGenerating={isGenerating}
          streamingMessageId={streamingMessageId}
        />

        {error && (
          <div className="px-3 pb-2 sm:px-5 md:px-8">
            <p className="mx-auto max-w-6xl border border-line bg-surface px-3 py-2 text-sm text-ink">
              {error}
            </p>
          </div>
        )}

        <ChatInput
          ref={chatInputRef}
          disabled={isLoading}
          onSend={handleSend}
        />
      </div>

      {overlayPanels && sidePanelOpen && (
        <button
          type="button"
          aria-label="Close side panel"
          className="panel-backdrop absolute inset-0 z-20"
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
        uiScale={uiScale}
        onUiScaleChange={(scale) => {
          setUiScale(scale);
          saveUiScale(scale);
          applyUiScale(scale);
        }}
        theme={theme}
        onThemeChange={(next) => {
          setTheme(next);
          saveTheme(next);
          applyTheme(next);
        }}
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
