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
      className="border-t border-line bg-paper px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-stretch gap-0">
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
          className="min-h-[3.25rem] flex-1 resize-none border border-line border-r-0 bg-paper px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:bg-hover disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="shrink-0 border border-line bg-ink px-5 text-sm font-medium uppercase tracking-wide text-paper transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-ink disabled:hover:text-paper"
        >
          Send
        </button>
      </div>
    </form>
  );
}
