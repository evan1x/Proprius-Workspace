import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface ChatWindowProps {
  messages: ChatMessage[];
  isGenerating: boolean;
}

export function ChatWindow({ messages, isGenerating }: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {isEmpty && (
          <div className="mt-20 border border-line px-6 py-10 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-ink">
              Start a conversation
            </p>
            <p className="mt-3 text-sm text-ink-muted">
              Enter a prompt below. Model replies appear here once a runtime is
              connected.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="border border-line bg-paper px-4 py-3 text-sm text-ink-muted">
              Generating…
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
