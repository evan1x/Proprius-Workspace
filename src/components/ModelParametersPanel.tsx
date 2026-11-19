import { useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_MODEL_PARAMETERS,
  normalizeModelParameters,
  type ModelParameters,
} from "../types/modelParams";

interface ModelParametersPanelProps {
  open: boolean;
  overlay?: boolean;
  model: string;
  value: ModelParameters;
  disabled?: boolean;
  onChange: (next: ModelParameters) => void;
  onClose: () => void;
}

function ParameterField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="block border-b border-line px-4 py-4">
      <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
        {hint}
      </span>
      <div className="mt-3">{children}</div>
    </label>
  );
}

export function ModelParametersPanel({
  open,
  overlay = false,
  model,
  value,
  disabled = false,
  onChange,
  onClose,
}: ModelParametersPanelProps) {
  const [draft, setDraft] = useState<ModelParameters>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function update<K extends keyof ModelParameters>(
    key: K,
    nextValue: ModelParameters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  function handleApply() {
    onChange(normalizeModelParameters(draft));
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_MODEL_PARAMETERS });
  }

  return (
    <aside
      id="model-parameters-panel"
      aria-label="Model parameters"
      className={`flex h-full min-h-0 min-w-0 w-[min(24rem,100%)] flex-col overflow-hidden border-l border-line bg-panel ${
        overlay ? "absolute inset-y-0 right-0 z-30" : "relative shrink-0"
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Parameters
          </p>
          <p className="mt-1 truncate text-sm font-medium tracking-wide text-ink">
            {model || "No model selected"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close parameters panel"
          className="shrink-0 border border-line bg-surface px-2.5 py-1.5 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ParameterField
          label="Temperature"
          hint="Higher = more creative / random. Lower = more focused."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              disabled={disabled}
              value={draft.temperature}
              onChange={(event) =>
                update("temperature", Number(event.target.value))
              }
              className="min-w-0 flex-1 accent-ink"
            />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              disabled={disabled}
              value={draft.temperature}
              onChange={(event) =>
                update("temperature", Number(event.target.value))
              }
              className="w-16 border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:bg-hover disabled:opacity-50"
            />
          </div>
        </ParameterField>

        <ParameterField
          label="Top P"
          hint="Nucleus sampling cutoff. Lower narrows token choices."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={disabled}
              value={draft.topP}
              onChange={(event) => update("topP", Number(event.target.value))}
              className="min-w-0 flex-1 accent-ink"
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              disabled={disabled}
              value={draft.topP}
              onChange={(event) => update("topP", Number(event.target.value))}
              className="w-16 border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:bg-hover disabled:opacity-50"
            />
          </div>
        </ParameterField>

        <ParameterField
          label="Top K"
          hint="Limits sampling to the K most likely tokens."
        >
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            disabled={disabled}
            value={draft.topK}
            onChange={(event) => update("topK", Number(event.target.value))}
            className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:bg-hover disabled:opacity-50"
          />
        </ParameterField>

        <ParameterField
          label="Context length"
          hint="Token window sent to the model (num_ctx)."
        >
          <input
            type="number"
            min={512}
            max={131072}
            step={256}
            disabled={disabled}
            value={draft.numCtx}
            onChange={(event) => update("numCtx", Number(event.target.value))}
            className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:bg-hover disabled:opacity-50"
          />
        </ParameterField>

        <ParameterField
          label="Max tokens"
          hint="Caps reply length. Use -1 for the model default."
        >
          <input
            type="number"
            min={-1}
            max={8192}
            step={1}
            disabled={disabled}
            value={draft.numPredict}
            onChange={(event) =>
              update("numPredict", Number(event.target.value))
            }
            className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:bg-hover disabled:opacity-50"
          />
        </ParameterField>

        <ParameterField
          label="System prompt"
          hint="Optional instructions applied to every reply."
        >
          <textarea
            rows={4}
            disabled={disabled}
            value={draft.systemPrompt}
            onChange={(event) => update("systemPrompt", event.target.value)}
            placeholder="You are a helpful assistant…"
            className="w-full resize-y border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:bg-hover disabled:opacity-50"
          />
        </ParameterField>
      </div>

      <div className="flex gap-2 border-t border-line px-4 py-4">
        <button
          type="button"
          disabled={disabled}
          onClick={handleReset}
          className="flex-1 border border-line px-3 py-2.5 text-xs font-medium tracking-wide text-ink transition hover:bg-hover disabled:opacity-40"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleApply}
          className="flex-1 border border-line bg-ink px-3 py-2.5 text-xs font-medium tracking-wide text-paper transition hover:bg-hover hover:text-ink disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </aside>
  );
}
