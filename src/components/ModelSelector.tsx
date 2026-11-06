import { useEffect, useRef, useState } from "react";

export interface PlaceholderModel {
  id: string;
  label: string;
}

/** Placeholder catalog until live Ollama model listing is implemented. */
export const PLACEHOLDER_MODELS: PlaceholderModel[] = [
  { id: "llama3.2:3b", label: "llama3.2:3b" },
  { id: "placeholder-2", label: "Model Name 2" },
  { id: "placeholder-3", label: "Model Name 3" },
  { id: "placeholder-4", label: "Model Name 4" },
];

interface ModelSelectorProps {
  model: string;
  models?: PlaceholderModel[];
  disabled?: boolean;
  onChange: (modelId: string) => void;
}

export function ModelSelector({
  model,
  models = PLACEHOLDER_MODELS,
  disabled = false,
  onChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = models.find((option) => option.id === model) ?? models[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group border border-line bg-paper px-3 py-1.5 text-right transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-ink"
      >
        <p className="text-[10px] uppercase tracking-wide text-ink-muted group-hover:text-paper/70">
          Model
        </p>
        <p className="flex items-center justify-end gap-2 text-xs font-medium uppercase tracking-wide text-ink group-hover:text-paper">
          <span className="max-w-[9rem] truncate">
            {selected?.label ?? model}
          </span>
          <span
            aria-hidden="true"
            className="text-ink-muted group-hover:text-paper/70"
          >
            ▾
          </span>
        </p>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select model"
          className="absolute top-full right-0 z-30 mt-0 min-w-[12rem] border border-line border-t-0 bg-paper"
        >
          <p className="border-b border-line px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-muted">
            Installed models · placeholder
          </p>
          <ul className="max-h-56 overflow-y-auto">
            {models.map((option) => {
              const isSelected = option.id === model;
              return (
                <li
                  key={option.id}
                  className="border-b border-line last:border-b-0"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs uppercase tracking-wide transition ${
                      isSelected
                        ? "bg-ink text-paper"
                        : "bg-paper text-ink hover:bg-hover"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <span aria-hidden="true">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
