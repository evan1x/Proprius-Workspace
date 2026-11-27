import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  formatBytesAsGb,
  getHardwareInfo,
  type HardwareInfo,
} from "../services/hardware";
import {
  suggestModelsForHardware,
  summarizeHardwareForSuggestions,
  type ModelSuggestion,
} from "../services/modelSuggestions";
import type { ThemeMode } from "../services/theme";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
} from "../services/uiScale";

const PANEL_WIDTH_STORAGE_KEY = "proprius.settingsPanelWidth";
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

export interface SuggestedInstallRequest {
  name: string;
  description?: string;
}

interface SettingsPanelProps {
  open: boolean;
  /** Overlay the chat instead of taking flex space (narrow windows). */
  overlay?: boolean;
  onClose: () => void;
  /** Opens the models panel and starts the pull confirm flow for this model. */
  onInstallSuggestion: (request: SuggestedInstallRequest) => void;
  installedModelNames?: string[];
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

function HardwareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1.5 break-words text-sm leading-snug text-ink">{value}</p>
    </div>
  );
}

function isSuggestionInstalled(
  installedNames: string[],
  suggestionName: string,
): boolean {
  const base = suggestionName.replace(/:latest$/, "");
  return installedNames.some((name) => {
    return (
      name === suggestionName ||
      name === base ||
      name.startsWith(`${base}:`) ||
      name.replace(/:latest$/, "") === base
    );
  });
}

export function SettingsPanel({
  open,
  overlay = false,
  onClose,
  onInstallSuggestion,
  installedModelNames = [],
  uiScale,
  onUiScaleChange,
  theme,
  onThemeChange,
}: SettingsPanelProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<ModelSuggestion | null>(
    null,
  );
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const panelWidthRef = useRef(panelWidth);

  useEffect(() => {
    if (!open) {
      setPendingInstall(null);
      return;
    }

    let cancelled = false;

    async function loadHardware() {
      setLoading(true);
      setError(null);
      try {
        const info = await getHardwareInfo();
        if (!cancelled) setHardware(info);
      } catch (err) {
        if (cancelled) return;
        setHardware(null);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to detect hardware information.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHardware();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !resizeDragRef.current) {
        if (pendingInstall) {
          setPendingInstall(null);
          return;
        }
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, pendingInstall]);

  useEffect(() => {
    setPanelWidth(readStoredPanelWidth());
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

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

  const suggestions = useMemo(
    () => (hardware ? suggestModelsForHardware(hardware, 3) : []),
    [hardware],
  );

  if (!open) return null;

  const memoryLabel = hardware
    ? `${formatBytesAsGb(hardware.availableMemoryBytes)} free / ${formatBytesAsGb(hardware.totalMemoryBytes)} total`
    : "—";

  const cpuCoresLabel = hardware
    ? `${hardware.cpuCoresPhysical || "—"} physical · ${hardware.cpuCoresLogical || "—"} logical`
    : "—";

  const maxOverlayWidth =
    typeof window === "undefined"
      ? panelWidth
      : Math.max(PANEL_MIN_WIDTH, window.innerWidth - 16);
  const effectiveWidth = overlay
    ? Math.min(panelWidth, maxOverlayWidth)
    : panelWidth;

  return (
    <aside
      id="settings-side-panel"
      aria-label="Settings"
      style={{ width: effectiveWidth, maxWidth: overlay ? "100%" : undefined }}
      className={`side-panel flex h-full min-h-0 flex-col overflow-hidden border-l border-line ${
        overlay
          ? "absolute inset-y-0 right-0 z-30"
          : "relative min-w-[16rem] shrink"
      } ${isResizing ? "select-none" : ""}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize settings panel"
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
            Settings
          </p>
          <p className="mt-1 text-sm font-medium tracking-wide text-ink">
            Appearance and hardware
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings panel"
          className="shrink-0 border border-line bg-surface px-2.5 py-1.5 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-line px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Interface
          </p>
          <p className="mt-1 text-sm font-medium text-ink">Scale</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Makes text and spacing larger or smaller across the workspace.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={uiScale}
              aria-label="Interface scale"
              onChange={(event) => onUiScaleChange(Number(event.target.value))}
              className="min-w-0 flex-1 accent-ink"
            />
            <span className="w-12 shrink-0 text-right text-sm font-medium text-ink">
              {uiScale}%
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-ink">Appearance</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Switch the workspace between dark and light.
          </p>
          <div className="mt-3 flex gap-2">
            {(["dark", "light"] as const).map((option) => {
              const selected = theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onThemeChange(option)}
                  className={`border px-3 py-2 text-xs font-medium uppercase tracking-wide transition ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-surface text-ink hover:bg-hover"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">
            Detected hardware
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError(null);
              void getHardwareInfo()
                .then(setHardware)
                .catch((err: unknown) => {
                  setHardware(null);
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Failed to detect hardware information.",
                  );
                })
                .finally(() => setLoading(false));
            }}
            className="border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="border-b border-line px-4 py-3 text-xs text-ink">
            {error}
          </p>
        )}

        {loading && !hardware && (
          <p className="border-b border-line px-4 py-3 text-xs text-ink-muted">
            Detecting hardware…
          </p>
        )}

        {hardware && (
          <div>
            <HardwareRow label="Hostname" value={hardware.hostname} />
            <HardwareRow
              label="Operating system"
              value={`${hardware.osName} ${hardware.osVersion}`.trim()}
            />
            <HardwareRow label="Architecture" value={hardware.arch} />
            <HardwareRow label="CPU" value={hardware.cpuBrand} />
            <HardwareRow label="CPU cores" value={cpuCoresLabel} />
            <HardwareRow label="Memory" value={memoryLabel} />
            <HardwareRow
              label="GPU"
              value={
                hardware.gpus.length > 0
                  ? hardware.gpus.join(" · ")
                  : "Not detected"
              }
            />
          </div>
        )}

        <section className="border-t border-line">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Suggested models
            </p>
            <p className="mt-1 text-xs leading-snug text-ink-muted">
              {hardware
                ? `Based on ${summarizeHardwareForSuggestions(hardware)}.`
                : "Recommendations appear after hardware is detected."}
            </p>
          </div>

          {hardware && suggestions.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink-muted">
              No model recommendations available for this hardware profile.
            </p>
          )}

          {hardware && (
            <ul>
              {suggestions.map((suggestion) => {
                const installed = isSuggestionInstalled(
                  installedModelNames,
                  suggestion.name,
                );
                return (
                  <li
                    key={suggestion.name}
                    className="border-b border-line px-4 py-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium uppercase tracking-wide text-ink">
                          {suggestion.name}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-muted">
                          {suggestion.parameterSize} params ·{" "}
                          {suggestion.fileSizeLabel} · {suggestion.fitLabel}
                          {installed ? " · installed" : ""}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                      {suggestion.description}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                      {suggestion.reason}
                    </p>
                    <button
                      type="button"
                      disabled={installed}
                      onClick={() => setPendingInstall(suggestion)}
                      className="mt-3 w-full border border-line px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {installed ? "Already installed" : "Install…"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {pendingInstall && (
        <div
          role="dialog"
          aria-label="Confirm suggested model install"
          className="absolute inset-0 z-20 flex flex-col bg-panel"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Install suggestion
            </p>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-ink">
              {pendingInstall.name}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              {pendingInstall.description}
            </p>
            <div className="mt-4 border border-line px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                Parameter size
              </p>
              <p className="mt-1 text-sm text-ink">
                {pendingInstall.parameterSize}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wide text-ink-muted">
                Approximate download
              </p>
              <p className="mt-1 text-sm text-ink">
                {pendingInstall.fileSizeLabel}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wide text-ink-muted">
                Fit for this PC
              </p>
              <p className="mt-1 text-sm text-ink">{pendingInstall.fitLabel}</p>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              {pendingInstall.reason} Continue to choose the exact tag and
              confirm the download in the models panel.
            </p>
          </div>
          <div className="flex gap-2 border-t border-line px-4 py-4">
            <button
              type="button"
              onClick={() => setPendingInstall(null)}
              className="flex-1 border border-line px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                const request = {
                  name: pendingInstall.name,
                  description: pendingInstall.description,
                };
                setPendingInstall(null);
                onInstallSuggestion(request);
              }}
              className="flex-1 border border-line bg-ink px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-paper transition hover:bg-paper hover:text-ink"
            >
              Yes, install
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
