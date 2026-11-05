import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../types/chat";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
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
  onSelect,
  onNewChat,
  onDelete,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Conversations
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-3 w-full border border-line bg-paper px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-4 py-6 text-xs text-ink-muted">
            No saved chats yet. Send a prompt to create one.
          </p>
        ) : (
          <ul className="flex flex-col">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId;
              const isMenuOpen = menuOpenId === conversation.id;

              return (
                <li
                  key={conversation.id}
                  className="relative border-b border-line"
                >
                  <div
                    className={`flex w-full items-stretch transition ${
                      isActive
                        ? "bg-ink text-paper"
                        : "bg-paper text-ink hover:bg-hover"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenId(null);
                        onSelect(conversation.id);
                      }}
                      className="min-w-0 flex-1 px-4 py-3 text-left"
                    >
                      <span className="block w-full truncate text-sm font-medium">
                        {conversation.title}
                      </span>
                      <span
                        className={`mt-1 block text-[10px] uppercase tracking-wide ${
                          isActive ? "text-paper/70" : "text-ink-muted"
                        }`}
                      >
                        {formatUpdatedAt(conversation.updatedAt)}
                      </span>
                    </button>

                    <div
                      ref={isMenuOpen ? menuRef : undefined}
                      className="relative flex items-start pt-2 pr-2"
                    >
                      <button
                        type="button"
                        aria-label={`Chat options for ${conversation.title}`}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId((current) =>
                            current === conversation.id ? null : conversation.id,
                          );
                        }}
                        className={`flex h-8 w-8 items-center justify-center border border-transparent text-sm leading-none transition ${
                          isActive
                            ? "text-paper hover:border-paper"
                            : "text-ink-muted hover:border-line hover:text-ink"
                        }`}
                      >
                        ⋮
                      </button>

                      {isMenuOpen && (
                        <div
                          role="menu"
                          className="absolute top-10 right-0 z-20 min-w-[7.5rem] border border-line bg-paper"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenId(null);
                              onDelete(conversation.id);
                            }}
                            className="w-full px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper"
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
        <p className="text-[10px] uppercase tracking-wide text-ink-muted">
          Storage · SQLite
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-muted">
          Runtime · Ollama
        </p>
      </div>
    </aside>
  );
}
