import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Conversation, Folder } from "../types/chat";

const SIDEBAR_WIDTH_STORAGE_KEY = "proprius.conversationsSidebarWidth";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "proprius.conversationsSidebarCollapsed";
const FOLDER_EXPANDED_STORAGE_KEY = "proprius.folderExpanded";
const CONVERSATION_DRAG_TYPE = "application/x-proprius-conversation";
const UNFILED_DROP_KEY = "__unfiled";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 52;

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    // ignore storage failures
  }
}

function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

function readStoredSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!stored) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readExpandedFolders(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(FOLDER_EXPANDED_STORAGE_KEY);
    if (!raw) return { __unfiled: true };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : { __unfiled: true };
  } catch {
    return { __unfiled: true };
  }
}

function saveExpandedFolders(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(
      FOLDER_EXPANDED_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // ignore storage failures
  }
}

interface SidebarProps {
  conversations: Conversation[];
  folders: Folder[];
  activeId: string | null;
  settingsOpen?: boolean;
  collapsed?: boolean;
  /** Hide entirely (used on narrow windows while a side panel is open). */
  hidden?: boolean;
  onSelect: (id: string) => void;
  onNewChat: (folderId?: string | null) => void;
  onDelete: (id: string) => void;
  onNewFolder: () => Promise<Folder | null>;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveConversation: (
    conversationId: string,
    folderId: string | null,
  ) => void;
  onOpenSettings?: () => void;
  onToggleCollapse?: () => void;
}

function formatUpdatedAt(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type OpenMenu =
  | { type: "chat"; id: string }
  | { type: "folder"; id: string }
  | { type: "move"; id: string }
  | null;

export function Sidebar({
  conversations,
  folders,
  activeId,
  settingsOpen = false,
  collapsed = false,
  hidden = false,
  onSelect,
  onNewChat,
  onDelete,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveConversation,
  onOpenSettings,
  onToggleCollapse,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState<OpenMenu>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({ __unfiled: true });
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const sidebarWidthRef = useRef(sidebarWidth);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const unfiledConversations = useMemo(
    () => conversations.filter((item) => !item.folderId),
    [conversations],
  );

  const conversationsByFolder = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const folder of folders) map.set(folder.id, []);
    for (const conversation of conversations) {
      if (!conversation.folderId) continue;
      const list = map.get(conversation.folderId);
      if (list) list.push(conversation);
      else map.set(conversation.folderId, [conversation]);
    }
    return map;
  }, [conversations, folders]);

  useEffect(() => {
    setSidebarWidth(readStoredSidebarWidth());
    setExpandedFolders(readExpandedFolders());
  }, []);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!renamingFolderId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingFolderId]);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    function handleWindowResize() {
      const maxWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.floor(window.innerWidth * 0.42),
      );
      setSidebarWidth((current) =>
        Math.min(current, Math.min(SIDEBAR_MAX_WIDTH, maxWidth)),
      );
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const viewportCap = Math.floor(window.innerWidth * 0.42);
      const nextWidth = Math.min(
        viewportCap,
        clampSidebarWidth(drag.startWidth + (event.clientX - drag.startX)),
      );
      setSidebarWidth(nextWidth);
    }

    function endResize() {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(
          SIDEBAR_WIDTH_STORAGE_KEY,
          String(sidebarWidthRef.current),
        );
      } catch {
        // ignore storage failures
      }
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endResize);
    document.addEventListener("pointercancel", endResize);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", endResize);
      document.removeEventListener("pointercancel", endResize);
    };
  }, []);

  function toggleFolderExpanded(key: string) {
    setExpandedFolders((current) => {
      const next = { ...current, [key]: !(current[key] ?? true) };
      saveExpandedFolders(next);
      return next;
    });
  }

  function isFolderExpanded(key: string): boolean {
    return expandedFolders[key] ?? true;
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (collapsed) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 16 : -16;
    setSidebarWidth((current) => {
      const next = clampSidebarWidth(current + delta);
      sidebarWidthRef.current = next;
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  function commitRename() {
    if (!renamingFolderId) return;
    const nextName = renameValue.trim();
    if (nextName) onRenameFolder(renamingFolderId, nextName);
    setRenamingFolderId(null);
    setRenameValue("");
  }

  function isConversationDrag(event: ReactDragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes(CONVERSATION_DRAG_TYPE);
  }

  function handleConversationDragStart(
    event: ReactDragEvent<HTMLElement>,
    conversationId: string,
  ) {
    event.dataTransfer.setData(CONVERSATION_DRAG_TYPE, conversationId);
    event.dataTransfer.effectAllowed = "move";
    setMenuOpen(null);
    setDraggingId(conversationId);
  }

  function handleConversationDragEnd() {
    setDraggingId(null);
    setDropTargetKey(null);
  }

  function handleDropTargetDragOver(
    event: ReactDragEvent<HTMLElement>,
    targetKey: string,
  ) {
    if (!isConversationDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetKey !== targetKey) setDropTargetKey(targetKey);
    if (targetKey !== UNFILED_DROP_KEY && !isFolderExpanded(targetKey)) {
      setExpandedFolders((current) => {
        const next = { ...current, [targetKey]: true };
        saveExpandedFolders(next);
        return next;
      });
    }
  }

  function handleDropTargetDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (!isConversationDrag(event)) return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDropTargetKey((current) =>
      current === event.currentTarget.dataset.dropKey ? null : current,
    );
  }

  function handleDropOnTarget(
    event: ReactDragEvent<HTMLElement>,
    folderId: string | null,
  ) {
    if (!isConversationDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const conversationId =
      event.dataTransfer.getData(CONVERSATION_DRAG_TYPE) || draggingId;
    setDraggingId(null);
    setDropTargetKey(null);
    if (!conversationId) return;

    const conversation = conversationsRef.current.find(
      (item) => item.id === conversationId,
    );
    const currentFolderId = conversation?.folderId ?? null;
    if (currentFolderId === folderId) return;
    onMoveConversation(conversationId, folderId);
  }

  function renderConversationRow(conversation: Conversation) {
    const isActive = conversation.id === activeId;
    const isDragging = draggingId === conversation.id;
    const isMenuOpen =
      menuOpen?.type === "chat" && menuOpen.id === conversation.id;
    const isMoveOpen =
      menuOpen?.type === "move" && menuOpen.id === conversation.id;

    return (
      <li key={conversation.id} className="relative px-2 py-0.5">
        <div
          draggable
          title="Drag to a folder"
          onDragStart={(event) =>
            handleConversationDragStart(event, conversation.id)
          }
          onDragEnd={handleConversationDragEnd}
          className={`flex w-full cursor-grab items-stretch transition active:cursor-grabbing ${
            isDragging ? "opacity-45" : ""
          } ${
            isActive
              ? "bg-surface text-ink"
              : "bg-transparent text-ink hover:bg-hover"
          }`}
        >
          <button
            type="button"
            draggable={false}
            onClick={() => {
              setMenuOpen(null);
              onSelect(conversation.id);
            }}
            className="min-w-0 flex-1 cursor-inherit px-3 py-2.5 text-left"
          >
            <span className="block w-full truncate text-sm font-medium">
              {conversation.title}
            </span>
            <span className="mt-1 block text-[10px] tracking-wide text-ink-muted">
              {formatUpdatedAt(conversation.updatedAt)}
            </span>
          </button>

          <div
            ref={isMenuOpen || isMoveOpen ? menuRef : undefined}
            className="relative flex items-start pt-1.5 pr-1.5"
          >
            <button
              type="button"
              aria-label={`Chat options for ${conversation.title}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen || isMoveOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((current) =>
                  current?.type === "chat" && current.id === conversation.id
                    ? null
                    : { type: "chat", id: conversation.id },
                );
              }}
              className="flex h-7 w-7 items-center justify-center text-sm leading-none text-ink-muted transition hover:text-ink"
            >
              ⋮
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute top-9 right-0 z-20 min-w-[8.5rem] border border-line bg-surface"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen({ type: "move", id: conversation.id });
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
                >
                  Move to…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(null);
                    onDelete(conversation.id);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
                >
                  Delete
                </button>
              </div>
            )}

            {isMoveOpen && (
              <div
                role="menu"
                className="absolute top-9 right-0 z-30 max-h-56 min-w-[9rem] overflow-y-auto border border-line bg-surface"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!conversation.folderId}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(null);
                    onMoveConversation(conversation.id, null);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Unfiled
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    role="menuitem"
                    disabled={conversation.folderId === folder.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpen(null);
                      onMoveConversation(conversation.id, folder.id);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {folder.name}
                  </button>
                ))}
                {folders.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-ink-muted">
                    Create a folder first.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  function renderFolderSection(folder: Folder) {
    const items = conversationsByFolder.get(folder.id) ?? [];
    const expanded = isFolderExpanded(folder.id);
    const isMenuOpen =
      menuOpen?.type === "folder" && menuOpen.id === folder.id;
    const isRenaming = renamingFolderId === folder.id;
    const isDropTarget = dropTargetKey === folder.id;

    return (
      <div
        key={folder.id}
        data-drop-key={folder.id}
        onDragOver={(event) => handleDropTargetDragOver(event, folder.id)}
        onDragLeave={handleDropTargetDragLeave}
        onDrop={(event) => handleDropOnTarget(event, folder.id)}
        className={`border-b border-line/60 transition ${
          isDropTarget ? "bg-hover ring-1 ring-inset ring-ink/40" : ""
        }`}
      >
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            type="button"
            onClick={() => toggleFolderExpanded(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left transition hover:bg-hover"
            aria-expanded={expanded}
          >
            <span aria-hidden="true" className="text-[10px] text-ink-muted">
              {expanded ? "▾" : "▸"}
            </span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    setRenamingFolderId(null);
                    setRenameValue("");
                  }
                }}
                className="min-w-0 flex-1 border border-line bg-paper px-1.5 py-0.5 text-xs font-medium text-ink outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                {folder.name}
                <span className="ml-1.5 text-ink-muted/70">({items.length})</span>
              </span>
            )}
          </button>

          <button
            type="button"
            title={`New chat in ${folder.name}`}
            aria-label={`New chat in ${folder.name}`}
            onClick={() => onNewChat(folder.id)}
            className="flex h-7 w-7 items-center justify-center text-sm text-ink-muted transition hover:text-ink"
          >
            +
          </button>

          <div
            ref={isMenuOpen ? menuRef : undefined}
            className="relative"
          >
            <button
              type="button"
              aria-label={`Folder options for ${folder.name}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((current) =>
                  current?.type === "folder" && current.id === folder.id
                    ? null
                    : { type: "folder", id: folder.id },
                );
              }}
              className="flex h-7 w-7 items-center justify-center text-sm leading-none text-ink-muted transition hover:text-ink"
            >
              ⋮
            </button>
            {isMenuOpen && (
              <div
                role="menu"
                className="absolute top-8 right-0 z-20 min-w-[8rem] border border-line bg-surface"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(null);
                    setRenamingFolderId(folder.id);
                    setRenameValue(folder.name);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(null);
                    onDeleteFolder(folder.id);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
                >
                  Delete folder
                </button>
              </div>
            )}
          </div>
        </div>

        {expanded && (
          <ul className="flex flex-col pb-1">
            {items.length === 0 ? (
              <li className="px-4 py-2 text-[10px] text-ink-muted">
                Drop chats here to organize them.
              </li>
            ) : (
              items.map(renderConversationRow)
            )}
          </ul>
        )}
      </div>
    );
  }

  if (hidden) return null;

  if (collapsed) {
    return (
      <aside
        style={{ width: SIDEBAR_COLLAPSED_WIDTH }}
        className="relative flex h-full shrink-0 flex-col items-center border-r border-line bg-panel"
      >
        <div className="flex w-full flex-col items-center gap-2 border-b border-line px-2 py-3">
          <button
            type="button"
            title="Expand conversations"
            aria-label="Expand conversations panel"
            aria-expanded={false}
            onClick={onToggleCollapse}
            className="flex h-8 w-8 items-center justify-center border border-line bg-surface text-sm text-ink transition hover:bg-hover"
          >
            ›
          </button>
          <button
            type="button"
            title="New chat"
            aria-label="New chat"
            onClick={() => onNewChat(null)}
            className="flex h-8 w-8 items-center justify-center border border-line bg-surface text-base font-medium leading-none text-ink transition hover:bg-hover"
          >
            +
          </button>
        </div>

        <div className="flex-1" />

        <div className="border-t border-line px-2 py-3">
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls="settings-side-panel"
            onClick={onOpenSettings}
            className={`flex h-8 w-8 items-center justify-center border border-line text-[10px] font-medium uppercase tracking-wide transition ${
              settingsOpen
                ? "bg-ink text-panel"
                : "bg-surface text-ink hover:bg-hover"
            }`}
          >
            S
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width: sidebarWidth, maxWidth: "42vw" }}
      className={`relative flex h-full min-w-0 shrink-0 flex-col border-r border-line bg-panel ${
        isResizing ? "select-none" : ""
      }`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversations panel"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        className={`absolute top-0 right-0 z-10 h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none ${
          isResizing ? "bg-ink/50" : "bg-transparent hover:bg-ink/25"
        }`}
      />

      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Conversations
          </p>
          <button
            type="button"
            title="Collapse conversations"
            aria-label="Collapse conversations panel"
            aria-expanded={true}
            onClick={onToggleCollapse}
            className="flex h-7 w-7 items-center justify-center border border-line bg-surface text-sm text-ink transition hover:bg-hover"
          >
            ‹
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onNewChat(null)}
            className="min-w-0 flex-1 border border-line bg-surface px-3 py-2 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
          >
            New chat
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const folder = await onNewFolder();
                if (!folder) return;
                setExpandedFolders((current) => {
                  const next = { ...current, [folder.id]: true };
                  saveExpandedFolders(next);
                  return next;
                });
                setRenamingFolderId(folder.id);
                setRenameValue(folder.name);
              })();
            }}
            className="shrink-0 border border-line bg-surface px-3 py-2 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
          >
            New folder
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && folders.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-ink-muted">
            No saved chats yet. Send a prompt to create one, or make a folder to
            organize conversations.
          </p>
        ) : (
          <>
            {folders.map(renderFolderSection)}

            <div
              data-drop-key={UNFILED_DROP_KEY}
              onDragOver={(event) =>
                handleDropTargetDragOver(event, UNFILED_DROP_KEY)
              }
              onDragLeave={handleDropTargetDragLeave}
              onDrop={(event) => handleDropOnTarget(event, null)}
              className={`transition ${
                dropTargetKey === UNFILED_DROP_KEY
                  ? "bg-hover ring-1 ring-inset ring-ink/40"
                  : ""
              }`}
            >
              <button
                type="button"
                onClick={() => toggleFolderExpanded(UNFILED_DROP_KEY)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left transition hover:bg-hover"
                aria-expanded={isFolderExpanded(UNFILED_DROP_KEY)}
              >
                <span aria-hidden="true" className="text-[10px] text-ink-muted">
                  {isFolderExpanded(UNFILED_DROP_KEY) ? "▾" : "▸"}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  Unfiled
                  <span className="ml-1.5 text-ink-muted/70">
                    ({unfiledConversations.length})
                  </span>
                </span>
              </button>
              {isFolderExpanded(UNFILED_DROP_KEY) && (
                <ul className="flex flex-col pb-1">
                  {unfiledConversations.length === 0 ? (
                    <li className="px-4 py-2 text-[10px] text-ink-muted">
                      Drop chats here, or leave them unfiled.
                    </li>
                  ) : (
                    unfiledConversations.map(renderConversationRow)
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="settings-side-panel"
            onClick={onOpenSettings}
            className={`border border-line px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide transition ${
              settingsOpen
                ? "bg-ink text-panel"
                : "bg-surface text-ink hover:bg-hover"
            }`}
          >
            Settings
          </button>
          <p className="text-[10px] tracking-wide text-ink-muted">
            Runtime · Ollama
          </p>
        </div>
      </div>
    </aside>
  );
}
