import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatAttachmentSize } from "../services/attachments";
import type { ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const attachments = message.attachments ?? [];

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

        {attachments.length > 0 && (
          <ul className="mb-2 flex flex-col gap-2">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="min-w-0">
                {attachment.kind === "image" && attachment.dataBase64 ? (
                  <div className="overflow-hidden rounded-xl border border-line">
                    <img
                      src={`data:${attachment.mimeType};base64,${attachment.dataBase64}`}
                      alt={attachment.name}
                      className="max-h-56 w-full object-contain bg-paper"
                    />
                    <p className="truncate border-t border-line px-2.5 py-1.5 text-[11px] text-ink-muted">
                      {attachment.name} · {formatAttachmentSize(attachment.size)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-line px-2.5 py-1.5 text-[11px] text-ink-muted">
                    <span className="font-medium text-ink">{attachment.name}</span>
                    <span>
                      {" "}
                      · {formatAttachmentSize(attachment.size)} ·{" "}
                      {attachment.kind === "text" ? "text" : "file"}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isUser ? (
          message.content.trim() ? (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {message.content}
            </p>
          ) : null
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
