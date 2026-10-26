import type { Conversation } from "../types/chat";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
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
}: SidebarProps) {
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
            No saved chats yet. Persistence is a placeholder until SQLite is
            connected.
          </p>
        ) : (
          <ul className="flex flex-col">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId;
              return (
                <li key={conversation.id} className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-ink text-paper"
                        : "bg-paper text-ink hover:bg-hover"
                    }`}
                  >
                    <span className="w-full truncate text-sm font-medium">
                      {conversation.title}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        isActive ? "text-paper/70" : "text-ink-muted"
                      }`}
                    >
                      {formatUpdatedAt(conversation.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <p className="text-[10px] uppercase tracking-wide text-ink-muted">
          Storage · placeholder
        </p>
      </div>
    </aside>
  );
}
