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
        className={
          isUser
            ? "max-w-[min(32rem,85%)] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-ink"
            : "w-full max-w-[42rem] rounded-2xl rounded-bl-md bg-panel px-4 py-3 text-ink"
        }
      >
        {!isUser && (
          <p className="mb-2 text-[11px] font-medium text-ink-muted">
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
