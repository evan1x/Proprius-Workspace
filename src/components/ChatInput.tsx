import { useState, type FormEvent, type KeyboardEvent } from "react";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (prompt: string) => void;
}

export function ChatInput({ disabled = false, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");

  function submit() {
    const prompt = value.trim();
    if (!prompt || disabled) return;
    onSend(prompt);
    setValue("");
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

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-line bg-paper px-5 py-4 md:px-8"
    >
      <div className="mx-auto flex w-full max-w-3xl items-stretch overflow-hidden border border-line bg-surface">
        <label className="sr-only" htmlFor="prompt-input">
          Prompt
        </label>
        <textarea
          id="prompt-input"
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a prompt… (Enter to send)"
          className="min-h-[3.25rem] flex-1 resize-none border-0 bg-transparent px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          disabled
          title="File attachments coming soon"
          aria-label="Attach file (coming soon)"
          className="shrink-0 border-l border-line px-3 text-ink-muted opacity-50"
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
          disabled={disabled || !value.trim()}
          className="shrink-0 border-l border-line bg-ink px-5 text-sm font-medium tracking-wide text-paper transition hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </form>
  );
}
