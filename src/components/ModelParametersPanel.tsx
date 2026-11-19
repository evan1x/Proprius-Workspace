import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DEFAULT_MODEL_PARAMETERS,
  normalizeModelParameters,
  type ModelParameters,
} from "../types/modelParams";

const PANEL_WIDTH_STORAGE_KEY = "proprius.parametersPanelWidth";
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 384;

function clampPanelWidth(width: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

function readStoredPanelWidth(): number {
  try {
    const stored = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (!stored) return PANEL_DEFAULT_WIDTH;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return PANEL_DEFAULT_WIDTH;
    return clampPanelWidth(parsed);
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

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
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const panelWidthRef = useRef(panelWidth);

  useEffect(() => {
    setPanelWidth(readStoredPanelWidth());
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !resizeDragRef.current) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    function handleWindowResize() {
      const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - 16);
      setPanelWidth((current) => Math.min(current, maxWidth));
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Left-edge drag: moving left widens the right-side panel.
      const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - 16);
      const nextWidth = Math.min(
        maxWidth,
        clampPanelWidth(drag.startWidth + (drag.startX - event.clientX)),
      );
      setPanelWidth(nextWidth);
    }

    function endResize() {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(
          PANEL_WIDTH_STORAGE_KEY,
          String(panelWidthRef.current),
        );
      } catch {
        // ignore storage failures
      }
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endResize);
    document.addEventListener("pointercancel", endResize);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", endResize);
      document.removeEventListener("pointercancel", endResize);
    };
  }, []);

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    setPanelWidth((current) => {
      const next = clampPanelWidth(current + delta);
      panelWidthRef.current = next;
      try {
        window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

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

  const maxOverlayWidth =
    typeof window === "undefined"
      ? panelWidth
      : Math.max(PANEL_MIN_WIDTH, window.innerWidth - 16);
  const effectiveWidth = overlay
    ? Math.min(panelWidth, maxOverlayWidth)
    : panelWidth;

  return (
    <aside
      id="model-parameters-panel"
      aria-label="Model parameters"
      style={{ width: effectiveWidth, maxWidth: overlay ? "100%" : undefined }}
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-panel ${
        overlay ? "absolute inset-y-0 right-0 z-30" : "shrink-0"
      } ${isResizing ? "select-none" : ""}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize parameters panel"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        className={`absolute top-0 left-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize touch-none ${
          isResizing ? "bg-ink/50" : "bg-transparent hover:bg-ink/25"
        }`}
      />

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
