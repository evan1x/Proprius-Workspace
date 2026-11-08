import { useEffect, useMemo, useState } from "react";
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

export interface SuggestedInstallRequest {
  name: string;
  description?: string;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Opens the models panel and starts the pull confirm flow for this model. */
  onInstallSuggestion: (request: SuggestedInstallRequest) => void;
  installedModelNames?: string[];
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
  onClose,
  onInstallSuggestion,
  installedModelNames = [],
}: SettingsPanelProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<ModelSuggestion | null>(
    null,
  );

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
      if (event.key === "Escape") {
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

  return (
    <aside
      id="settings-side-panel"
      aria-label="Settings"
      className="relative flex h-full w-[22rem] shrink-0 flex-col border-l border-line bg-paper md:w-[24rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Settings
          </p>
          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-ink">
            Hardware
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings panel"
          className="shrink-0 border border-line px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
          className="absolute inset-0 z-20 flex flex-col bg-paper"
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
