import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  formatModelSize,
  getModelsInstallPath,
  listInstalledModels,
  pullModel,
  type InstalledModel,
  type PullProgress,
} from "../services/llm";

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of ["message", "error", "msg"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}

interface ModelSelectorProps {
  model: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
  onModelsChange?: (models: InstalledModel[]) => void;
}

export function ModelSelector({
  model,
  disabled = false,
  onChange,
  onModelsChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [installPath, setInstallPath] = useState("~/.ollama/models");
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [openPathError, setOpenPathError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function handleOpenInstallPath() {
    setOpenPathError(null);
    if (!installPath || installPath.startsWith("~")) {
      setOpenPathError("Install path is not available yet.");
      return;
    }

    // Prefer openPath (opens the folder). Fall back to revealItemInDir,
    // which is included in opener:default and does not require a path scope.
    const attempts: Array<() => Promise<void>> = [
      () => openPath(installPath),
      () => revealItemInDir(installPath),
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (err) {
        lastError = err;
      }
    }

    setOpenPathError(
      toErrorMessage(lastError, "Could not open the install folder."),
    );
  }

  async function refreshModels() {
    setLoadingList(true);
    setListError(null);
    try {
      const [installed, path] = await Promise.all([
        listInstalledModels(),
        getModelsInstallPath(),
      ]);
      setModels(installed);
      setInstallPath(path);
      onModelsChange?.(installed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load installed models.";
      setListError(message);
      setModels([]);
      onModelsChange?.([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void refreshModels();
    void getModelsInstallPath().then(setInstallPath).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshModels();
  }, [open]);

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

  async function handleOpenTerminal() {
    setTerminalError(null);
    setOpeningTerminal(true);
    try {
      await invoke("open_terminal");
    } catch (err) {
      setTerminalError(
        toErrorMessage(err, "Could not open a system terminal."),
      );
    } finally {
      setOpeningTerminal(false);
    }
  }

  async function handlePull(event: FormEvent) {
    event.preventDefault();
    const name = pullName.trim();
    if (!name || pulling) return;

    setPulling(true);
    setPullError(null);
    setPullProgress({ status: "starting" });

    try {
      await pullModel(name, (progress) => setPullProgress(progress));
      setPullName("");
      setPullProgress({ status: "success", percent: 100 });
      await refreshModels();
      onChange(name);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to pull model.";
      setPullError(message);
      setPullProgress(null);
    } finally {
      setPulling(false);
    }
  }

  const selectedLabel =
    models.find((entry) => entry.name === model)?.name ?? model;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group border border-line bg-paper px-3 py-1.5 text-right transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-ink"
      >
        <p className="text-[10px] uppercase tracking-wide text-ink-muted group-hover:text-paper/70">
          Model
        </p>
        <p className="flex items-center justify-end gap-2 text-xs font-medium uppercase tracking-wide text-ink group-hover:text-paper">
          <span className="max-w-[9rem] truncate">{selectedLabel}</span>
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
          role="dialog"
          aria-label="Manage Ollama models"
          className="absolute top-full right-0 z-30 mt-0 w-[22rem] border border-line border-t-0 bg-paper"
        >
          <div className="border-b border-line px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                Install path
              </p>
              <button
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleOpenInstallPath();
                }}
                title="Open install folder"
                aria-label="Open install folder"
                className="shrink-0 border border-line p-1 text-ink transition hover:bg-ink hover:text-paper"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2.5 4.5h4l1.25 1.5H13.5v6.5h-11v-8z" />
                  <path d="M2.5 6h11" />
                </svg>
              </button>
            </div>
            <p
              className="mt-1 break-all text-[11px] leading-snug text-ink"
              title={installPath}
            >
              {installPath}
            </p>
            {openPathError && (
              <p className="mt-1 text-[11px] leading-snug text-ink">
                {openPathError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Installed models
            </p>
            <button
              type="button"
              onClick={() => {
                void refreshModels();
              }}
              disabled={loadingList || pulling}
              className="border border-line px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              {loadingList ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {listError && (
              <p className="border-b border-line px-3 py-3 text-xs text-ink">
                {listError}
              </p>
            )}

            {!listError && !loadingList && models.length === 0 && (
              <p className="border-b border-line px-3 py-3 text-xs text-ink-muted">
                No models installed. Pull one below.
              </p>
            )}

            <ul>
              {models.map((entry) => {
                const isSelected = entry.name === model;
                return (
                  <li
                    key={entry.name}
                    className="border-b border-line last:border-b-0"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(entry.name);
                        setOpen(false);
                      }}
                      className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition ${
                        isSelected
                          ? "bg-ink text-paper"
                          : "bg-paper text-ink hover:bg-hover"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium uppercase tracking-wide">
                          {entry.name}
                        </span>
                        {isSelected && <span aria-hidden="true">✓</span>}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide ${
                          isSelected ? "text-paper/70" : "text-ink-muted"
                        }`}
                      >
                        {formatModelSize(entry.size)} · local
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <form
            onSubmit={(event) => {
              void handlePull(event);
            }}
            className="border-t border-line px-3 py-3"
          >
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Pull from Ollama
            </p>
            <div className="mt-2 flex items-stretch">
              <input
                type="text"
                value={pullName}
                disabled={pulling}
                onChange={(event) => setPullName(event.target.value)}
                placeholder="e.g. llama3.2:3b"
                className="min-w-0 flex-1 border border-line border-r-0 bg-paper px-2.5 py-2 text-xs text-ink outline-none placeholder:text-ink-muted focus:bg-hover disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={pulling || !pullName.trim()}
                className="shrink-0 border border-line bg-ink px-3 text-xs font-medium uppercase tracking-wide text-paper transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-ink disabled:hover:text-paper"
              >
                {pulling ? "Pulling…" : "Pull"}
              </button>
            </div>

            {pullProgress && (
              <p className="mt-2 text-[10px] uppercase tracking-wide text-ink-muted">
                {pullProgress.status}
                {typeof pullProgress.percent === "number"
                  ? ` · ${pullProgress.percent}%`
                  : ""}
              </p>
            )}

            {pullError && (
              <p className="mt-2 text-xs text-ink">{pullError}</p>
            )}
          </form>

          <div className="border-t border-line px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Advanced
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              Open a system terminal to run Ollama commands directly.
            </p>
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleOpenTerminal();
              }}
              disabled={openingTerminal}
              className="mt-2 w-full border border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {openingTerminal ? "Opening…" : "Open terminal"}
            </button>
            {terminalError && (
              <p className="mt-2 text-xs text-ink">{terminalError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
