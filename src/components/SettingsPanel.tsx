import { useEffect, useState } from "react";
import {
  formatBytesAsGb,
  getHardwareInfo,
  type HardwareInfo,
} from "../services/hardware";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
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

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

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
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

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
      className="flex h-full w-[22rem] shrink-0 flex-col border-l border-line bg-paper md:w-[24rem]"
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
            <HardwareRow
              label="Hostname"
              value={hardware.hostname}
            />
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
      </div>
    </aside>
  );
}
