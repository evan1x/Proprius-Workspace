import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface ChatWindowProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  streamingMessageId?: string | null;
  /** Scroll this message into view instead of the latest reply. */
  focusMessageId?: string | null;
  focusNonce?: number;
}

export function ChatWindow({
  messages,
  isGenerating,
  streamingMessageId = null,
  focusMessageId = null,
  focusNonce = 0,
}: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrolledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusMessageId) {
      const mark = `${focusMessageId}:${focusNonce}`;
      if (scrolledFocusRef.current === mark) return;
      const node = document.getElementById(`message-${focusMessageId}`);
      if (!node) {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      scrolledFocusRef.current = mark;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating, focusMessageId, focusNonce]);

  const isEmpty = messages.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {isEmpty && (
          <div className="mt-16 px-2 text-center md:mt-24">
            <p className="text-base font-medium tracking-tight text-ink">
              Start a conversation
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              Enter a prompt below. Model replies appear here once a runtime is
              connected.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const focused = message.id === focusMessageId;
          return (
            <div
              key={focused ? `${message.id}:${focusNonce}` : message.id}
              id={`message-${message.id}`}
              className={focused ? "message-focus" : undefined}
            >
              <MessageBubble
                message={message}
                streaming={message.id === streamingMessageId}
              />
            </div>
          );
        })}

        <div ref={endRef} />
      </div>
    </div>
  );
}
