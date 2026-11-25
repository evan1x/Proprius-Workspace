import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface ChatWindowProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  streamingMessageId?: string | null;
}

export function ChatWindow({
  messages,
  isGenerating,
  streamingMessageId = null,
}: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

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

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            streaming={message.id === streamingMessageId}
          />
        ))}

        <div ref={endRef} />
      </div>
    </div>
  );
}
