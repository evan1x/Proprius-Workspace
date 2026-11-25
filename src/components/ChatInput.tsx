import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  formatAttachmentSize,
  MAX_ATTACHMENTS,
  readFileAsAttachment,
} from "../services/attachments";
import type { ChatAttachment } from "../types/chat";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (prompt: string, attachments: ChatAttachment[]) => void;
}

export interface ChatInputHandle {
  addFiles: (fileList: FileList | null) => Promise<void>;
  canAcceptFiles: () => boolean;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ disabled = false, onSend }, ref) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [readingFiles, setReadingFiles] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const attachmentsRef = useRef(attachments);
    const readingFilesRef = useRef(readingFiles);
    const disabledRef = useRef(disabled);

    attachmentsRef.current = attachments;
    readingFilesRef.current = readingFiles;
    disabledRef.current = disabled;

    const canAttach =
      !disabled && !readingFiles && attachments.length < MAX_ATTACHMENTS;
    const canSend =
      !disabled &&
      !readingFiles &&
      (value.trim().length > 0 || attachments.length > 0);

    async function addFiles(fileList: FileList | null) {
      if (!fileList || fileList.length === 0) return;
      if (disabledRef.current || readingFilesRef.current) return;

      setAttachError(null);
      const remaining = MAX_ATTACHMENTS - attachmentsRef.current.length;
      if (remaining <= 0) {
        setAttachError(
          `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
        );
        return;
      }

      const selected = Array.from(fileList).slice(0, remaining);
      setReadingFiles(true);
      try {
        const next: ChatAttachment[] = [];
        for (const file of selected) {
          next.push(await readFileAsAttachment(file));
        }
        setAttachments((current) => [...current, ...next]);
        if (fileList.length > remaining) {
          setAttachError(
            `Only ${MAX_ATTACHMENTS} files allowed — extra files were skipped.`,
          );
        }
      } catch (err) {
        setAttachError(
          err instanceof Error ? err.message : "Failed to read attachment.",
        );
      } finally {
        setReadingFiles(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }

    useImperativeHandle(ref, () => ({
      addFiles,
      canAcceptFiles: () =>
        !disabledRef.current &&
        !readingFilesRef.current &&
        attachmentsRef.current.length < MAX_ATTACHMENTS,
    }));

    function removeAttachment(id: string) {
      setAttachments((current) => current.filter((item) => item.id !== id));
    }

    function submit() {
      const prompt = value.trim();
      if (disabled || readingFiles) return;
      if (!prompt && attachments.length === 0) return;

      onSend(prompt, attachments);
      setValue("");
      setAttachments([]);
      setAttachError(null);
      textareaRef.current?.focus();
    }

    function handleSubmit(event: FormEvent) {
      event.preventDefault();
      submit();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
      void addFiles(event.target.files);
    }

    return (
      <form
        onSubmit={handleSubmit}
        className="border-t border-line bg-paper px-4 py-4 sm:px-6"
      >
        <div className="mx-auto w-full max-w-6xl">
          {(attachments.length > 0 || attachError) && (
            <div className="mb-2 space-y-2">
              {attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                    >
                      <span className="min-w-0 truncate">
                        {attachment.name}
                        <span className="text-ink-muted">
                          {" "}
                          · {formatAttachmentSize(attachment.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={disabled || readingFiles}
                        onClick={() => removeAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.name}`}
                        className="shrink-0 text-ink-muted transition hover:text-ink disabled:opacity-40"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {attachError && (
                <p className="text-xs text-ink-muted">{attachError}</p>
              )}
            </div>
          )}

          <div className="flex w-full items-stretch overflow-hidden rounded-2xl border border-line bg-surface">
            <label className="sr-only" htmlFor="prompt-input">
              Prompt
            </label>
            <textarea
              ref={textareaRef}
              id="prompt-input"
              rows={2}
              value={value}
              disabled={disabled || readingFiles}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                attachments.length > 0
                  ? "Add a prompt for the attached file(s)… (Enter to send)"
                  : "Write a prompt or drop files… (Enter to send)"
              }
              className="min-h-[4.25rem] flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[17px] text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none disabled:opacity-50"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || readingFiles}
            />
            <button
              type="button"
              disabled={!canAttach}
              title="Attach files"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 border-l border-line px-3 text-ink transition hover:bg-hover disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8.5 3.5v6.25a2.25 2.25 0 1 1-4.5 0V4.75a1.25 1.25 0 1 1 2.5 0v4.5" />
              </svg>
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="shrink-0 border-l border-line bg-ink px-6 text-base font-medium tracking-wide text-paper transition hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted disabled:opacity-60"
            >
              {readingFiles ? "…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    );
  },
);
