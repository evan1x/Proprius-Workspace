import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Conversation } from "../types/chat";

const SIDEBAR_WIDTH_STORAGE_KEY = "proprius.conversationsSidebarWidth";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "proprius.conversationsSidebarCollapsed";
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

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  settingsOpen?: boolean;
  collapsed?: boolean;
  /** Hide entirely (used on narrow windows while a side panel is open). */
  hidden?: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
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

export function Sidebar({
  conversations,
  activeId,
  settingsOpen = false,
  collapsed = false,
  hidden = false,
  onSelect,
  onNewChat,
  onDelete,
  onOpenSettings,
  onToggleCollapse,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    setSidebarWidth(readStoredSidebarWidth());
  }, []);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!menuOpenId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpenId(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpenId]);

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
      // Right-edge drag: moving right widens the left sidebar.
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
            onClick={onNewChat}
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
        <button
          type="button"
          onClick={onNewChat}
          className="mt-3 w-full border border-line bg-surface px-3 py-2 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-ink-muted">
            No saved chats yet. Send a prompt to create one.
          </p>
        ) : (
          <ul className="flex flex-col py-1">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId;
              const isMenuOpen = menuOpenId === conversation.id;

              return (
                <li key={conversation.id} className="relative px-2 py-0.5">
                  <div
                    className={`flex w-full items-stretch transition ${
                      isActive
                        ? "bg-surface text-ink"
                        : "bg-transparent text-ink hover:bg-hover"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenId(null);
                        onSelect(conversation.id);
                      }}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <span className="block w-full truncate text-sm font-medium">
                        {conversation.title}
                      </span>
                      <span className="mt-1 block text-[10px] tracking-wide text-ink-muted">
                        {formatUpdatedAt(conversation.updatedAt)}
                      </span>
                    </button>

                    <div
                      ref={isMenuOpen ? menuRef : undefined}
                      className="relative flex items-start pt-1.5 pr-1.5"
                    >
                      <button
                        type="button"
                        aria-label={`Chat options for ${conversation.title}`}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId((current) =>
                            current === conversation.id
                              ? null
                              : conversation.id,
                          );
                        }}
                        className="flex h-7 w-7 items-center justify-center text-sm leading-none text-ink-muted transition hover:text-ink"
                      >
                        ⋮
                      </button>

                      {isMenuOpen && (
                        <div
                          role="menu"
                          className="absolute top-9 right-0 z-20 min-w-[7.5rem] border border-line bg-surface"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenId(null);
                              onDelete(conversation.id);
                            }}
                            className="w-full px-3 py-2 text-left text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
