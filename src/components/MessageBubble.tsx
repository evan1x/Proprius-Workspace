import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] border border-line px-4 py-3 ${
          isUser ? "bg-ink text-paper" : "bg-paper text-ink"
        }`}
      >
        {!isUser && (
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Assistant
          </p>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="markdown-body break-words text-[15px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
