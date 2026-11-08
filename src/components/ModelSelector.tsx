import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  deleteModel,
  formatModelSize,
  getLibraryBaseName,
  getLibraryTag,
  getModelsInstallPath,
  listInstalledModels,
  listModelTagOptions,
  listPopularLibraryModels,
  PullCancelledError,
  pullModel,
  searchLibraryModels,
  type InstalledModel,
  type LibraryModel,
  type ModelTagOption,
  type PullProgress,
} from "../services/llm";

interface PendingPull {
  baseName: string;
  description?: string;
  fallbackSizes: string[];
  suggestedTag: string | null;
}

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

function isModelInstalled(
  installed: InstalledModel[],
  libraryName: string,
): boolean {
  return installed.some(
    (entry) =>
      entry.name === libraryName ||
      entry.name.startsWith(`${libraryName}:`) ||
      entry.name.replace(/:latest$/, "") === libraryName,
  );
}

const PANEL_WIDTH_STORAGE_KEY = "proprius.modelsPanelWidth";
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 416;

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

export interface ExternalPullRequest {
  name: string;
  description?: string;
  sizes?: string[];
}

interface ModelSelectorProps {
  open: boolean;
  model: string;
  disabled?: boolean;
  onClose: () => void;
  onChange: (modelId: string) => void;
  onModelsChange?: (models: InstalledModel[]) => void;
  /** When set while the panel is open, starts the pull confirm flow once. */
  externalPullRequest?: ExternalPullRequest | null;
  onExternalPullRequestHandled?: () => void;
}

export function ModelSelector({
  open,
  model,
  disabled = false,
  onClose,
  onChange,
  onModelsChange,
  externalPullRequest = null,
  onExternalPullRequestHandled,
}: ModelSelectorProps) {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [installPath, setInstallPath] = useState("~/.ollama/models");
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [cancellingPull, setCancellingPull] = useState(false);
  const [pendingPull, setPendingPull] = useState<PendingPull | null>(null);
  const [tagOptions, setTagOptions] = useState<ModelTagOption[]>([]);
  const [selectedTagName, setSelectedTagName] = useState<string>("");
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [activePullName, setActivePullName] = useState<string | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [openPathError, setOpenPathError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryModels, setLibraryModels] = useState<LibraryModel[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const libraryRequestId = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pullAbortRef = useRef<AbortController | null>(null);
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

  async function handleOpenInstallPath() {
    setOpenPathError(null);
    if (!installPath || installPath.startsWith("~")) {
      setOpenPathError("Install path is not available yet.");
      return;
    }

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

  async function loadLibrary(query: string) {
    const requestId = ++libraryRequestId.current;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const results = query.trim()
        ? await searchLibraryModels(query)
        : await listPopularLibraryModels();
      if (requestId !== libraryRequestId.current) return;
      setLibraryModels(results);
    } catch (err) {
      if (requestId !== libraryRequestId.current) return;
      setLibraryModels([]);
      setLibraryError(
        toErrorMessage(err, "Could not load models from ollama.com."),
      );
    } finally {
      if (requestId === libraryRequestId.current) {
        setLibraryLoading(false);
      }
    }
  }

  useEffect(() => {
    void refreshModels();
    void getModelsInstallPath().then(setInstallPath).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshModels();
    void loadLibrary(libraryQuery);
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      void loadLibrary(libraryQuery);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [libraryQuery, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !resizeDragRef.current) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Left-edge drag: moving left widens the right-side panel.
      const nextWidth = clampPanelWidth(
        drag.startWidth + (drag.startX - event.clientX),
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

  function requestPull(
    name: string,
    details?: {
      description?: string;
      sizeLabel?: string | null;
      sizes?: string[];
    },
  ) {
    const trimmed = name.trim();
    if (!trimmed || pulling || cancellingPull || disabled) return;

    const baseName = getLibraryBaseName(trimmed);
    const suggestedTag = getLibraryTag(trimmed);

    setPullError(null);
    setPullProgress(null);
    setTagsError(null);
    setTagOptions([]);
    setSelectedTagName(
      suggestedTag ? `${baseName}:${suggestedTag}` : `${baseName}:latest`,
    );
    setPendingPull({
      baseName,
      description: details?.description,
      fallbackSizes: details?.sizes ?? [],
      suggestedTag,
    });
  }

  useEffect(() => {
    if (!open || !externalPullRequest || pulling || cancellingPull || disabled) {
      return;
    }

    requestPull(externalPullRequest.name, {
      description: externalPullRequest.description,
      sizes: externalPullRequest.sizes,
    });
    onExternalPullRequestHandled?.();
    // Intentionally only react to a new external request while the panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, externalPullRequest]);

  useEffect(() => {
    if (!pendingPull) return;
    const request = pendingPull;

    let cancelled = false;

    async function loadTags() {
      setTagsLoading(true);
      setTagsError(null);
      try {
        const options = await listModelTagOptions(
          request.baseName,
          request.fallbackSizes,
        );
        if (cancelled) return;
        setTagOptions(options);

        const preferred =
          (request.suggestedTag &&
            options.find(
              (option) =>
                option.tag === request.suggestedTag ||
                option.name === `${request.baseName}:${request.suggestedTag}`,
            )) ||
          options.find((option) => option.tag === "latest") ||
          options[0];

        if (preferred) {
          setSelectedTagName(preferred.name);
        } else {
          setSelectedTagName(request.baseName);
        }
      } catch (err) {
        if (cancelled) return;
        setTagOptions([]);
        setTagsError(
          toErrorMessage(err, "Could not load available model sizes."),
        );
        setSelectedTagName(request.baseName);
      } finally {
        if (!cancelled) setTagsLoading(false);
      }
    }

    void loadTags();

    return () => {
      cancelled = true;
    };
  }, [pendingPull]);

  async function confirmPull() {
    if (!pendingPull || pulling || disabled) return;

    const trimmed = (selectedTagName || pendingPull.baseName).trim();
    if (!trimmed) return;

    const controller = new AbortController();
    pullAbortRef.current = controller;

    setPendingPull(null);
    setTagOptions([]);
    setTagsError(null);
    setPulling(true);
    setCancellingPull(false);
    setPullError(null);
    setPullProgress({ status: "starting" });
    setPullName(trimmed);
    setActivePullName(trimmed);

    try {
      await pullModel(
        trimmed,
        (progress) => setPullProgress(progress),
        controller.signal,
      );
      setPullProgress({ status: "success", percent: 100 });
      await refreshModels();
      onChange(trimmed);
    } catch (err) {
      if (err instanceof PullCancelledError || controller.signal.aborted) {
        setPullProgress({ status: "cancelling" });
        setCancellingPull(true);
        try {
          await deleteModel(trimmed);
          setPullProgress(null);
          setPullError("Pull cancelled. The model was removed from this machine.");
        } catch (deleteErr) {
          setPullProgress(null);
          setPullError(
            toErrorMessage(
              deleteErr,
              "Pull cancelled, but the model could not be fully removed. Check Ollama and try deleting it manually.",
            ),
          );
        } finally {
          await refreshModels();
        }
      } else {
        const message =
          err instanceof Error ? err.message : "Failed to pull model.";
        setPullError(message);
        setPullProgress(null);
      }
    } finally {
      pullAbortRef.current = null;
      setActivePullName(null);
      setPulling(false);
      setCancellingPull(false);
    }
  }

  function cancelPull() {
    if (!pulling || cancellingPull) return;
    setCancellingPull(true);
    setPullProgress({ status: "cancelling" });
    pullAbortRef.current?.abort();
  }

  function handlePull(event: FormEvent) {
    event.preventDefault();
    requestPull(pullName);
  }

  if (!open) return null;

  const showingSearch = libraryQuery.trim().length > 0;

  return (
    <aside
      ref={panelRef}
      id="models-side-panel"
      aria-label="Manage Ollama models"
      style={{ width: panelWidth }}
      className={`relative flex h-full shrink-0 flex-col border-l border-line bg-paper ${
        isResizing ? "select-none" : ""
      }`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize models panel"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        className={`absolute top-0 left-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize touch-none ${
          isResizing ? "bg-ink" : "bg-transparent hover:bg-ink/40"
        }`}
      />

      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Models
          </p>
          <p className="mt-1 truncate text-sm font-medium uppercase tracking-wide text-ink">
            {model}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pulling || cancellingPull}
          aria-label="Close models panel"
          className="shrink-0 border border-line px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          Close
        </button>
      </div>

      {pendingPull && (
        <div
          role="dialog"
          aria-label="Confirm model download"
          className="absolute inset-0 z-20 flex flex-col bg-paper"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Confirm download
            </p>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-ink">
              {pendingPull.baseName}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            {pendingPull.description && (
              <p className="text-sm leading-relaxed text-ink-muted">
                {pendingPull.description}
              </p>
            )}

            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                Parameter size
              </p>
              <p className="mt-1 text-xs leading-snug text-ink-muted">
                Choose which variant to download.
              </p>

              {tagsLoading && (
                <p className="mt-3 text-xs text-ink-muted">Loading sizes…</p>
              )}

              {tagsError && (
                <p className="mt-3 text-xs text-ink">{tagsError}</p>
              )}

              {!tagsLoading && tagOptions.length > 0 && (
                <ul className="mt-3 border border-line">
                  {tagOptions.map((option) => {
                    const selected = option.name === selectedTagName;
                    const installed = isModelInstalled(models, option.name);
                    return (
                      <li
                        key={option.name}
                        className="border-b border-line last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedTagName(option.name)}
                          className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition ${
                            selected
                              ? "bg-ink text-paper"
                              : "bg-paper text-ink hover:bg-hover"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium uppercase tracking-wide">
                              {option.tag}
                            </span>
                            <span
                              className={`mt-1 block text-[10px] uppercase tracking-wide ${
                                selected ? "text-paper/70" : "text-ink-muted"
                              }`}
                            >
                              {option.name}
                              {installed ? " · installed" : ""}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[10px] uppercase tracking-wide ${
                              selected ? "text-paper/70" : "text-ink-muted"
                            }`}
                          >
                            {option.sizeLabel ?? "—"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!tagsLoading && tagOptions.length === 0 && !tagsError && (
                <p className="mt-3 text-xs text-ink-muted">
                  No parameter sizes found. Pulling {pendingPull.baseName} as
                  latest.
                </p>
              )}
            </div>

            <div className="mt-4 border border-line px-3 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                Will download
              </p>
              <p className="mt-1 break-all text-sm text-ink">
                {selectedTagName || pendingPull.baseName}
              </p>
              {isModelInstalled(
                models,
                selectedTagName || pendingPull.baseName,
              ) && (
                <p className="mt-2 text-xs leading-snug text-ink-muted">
                  This variant is already installed. Pulling again may replace
                  local files.
                </p>
              )}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              Large models can take several minutes and use significant disk
              space. You can cancel during the download; cancelling removes the
              model from this machine.
            </p>
          </div>
          <div className="flex gap-2 border-t border-line px-4 py-4">
            <button
              type="button"
              onClick={() => {
                setPendingPull(null);
                setTagOptions([]);
                setTagsError(null);
              }}
              className="flex-1 border border-line px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper"
            >
              Back
            </button>
            <button
              type="button"
              disabled={tagsLoading || !selectedTagName}
              onClick={() => {
                void confirmPull();
              }}
              className="flex-1 border border-line bg-ink px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-paper transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm pull
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="border-b border-line px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                Install path
              </p>
              <p
                className="mt-2 break-all text-xs leading-relaxed text-ink"
                title={installPath}
              >
                {installPath}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleOpenInstallPath();
              }}
              title="Open install folder"
              aria-label="Open install folder"
              className="shrink-0 border border-line p-2 text-ink transition hover:bg-ink hover:text-paper"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2.5 4.5h4l1.25 1.5H13.5v6.5h-11v-8z" />
                <path d="M2.5 6h11" />
              </svg>
            </button>
          </div>
          {openPathError && (
            <p className="mt-2 text-xs leading-snug text-ink">{openPathError}</p>
          )}
        </section>

        <section className="border-b border-line">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Installed
            </p>
            <button
              type="button"
              onClick={() => {
                void refreshModels();
              }}
              disabled={loadingList || pulling}
              className="border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              {loadingList ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {listError && (
              <p className="px-4 py-3 text-xs text-ink">{listError}</p>
            )}

            {!listError && !loadingList && models.length === 0 && (
              <p className="px-4 py-3 text-xs text-ink-muted">
                No models installed yet. Pull one from the library below.
              </p>
            )}

            <ul>
              {models.map((entry) => {
                const isSelected = entry.name === model;
                return (
                  <li key={entry.name} className="border-t border-line">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={disabled}
                      onClick={() => onChange(entry.name)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition disabled:opacity-40 ${
                        isSelected
                          ? "bg-ink text-paper"
                          : "bg-paper text-ink hover:bg-hover"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium uppercase tracking-wide">
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
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-line px-4 py-4">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Search Ollama library
            </p>
            <input
              ref={searchInputRef}
              type="search"
              value={libraryQuery}
              disabled={pulling}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search models…"
              className="mt-3 w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:bg-hover disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              {showingSearch ? "Search results" : "Popular"}
            </p>
            {libraryLoading && (
              <span className="text-[10px] uppercase tracking-wide text-ink-muted">
                Loading…
              </span>
            )}
          </div>

          <div className="min-h-[12rem] flex-1 overflow-y-auto">
            {libraryError && (
              <p className="border-b border-line px-4 py-3 text-xs text-ink">
                {libraryError}
              </p>
            )}

            {!libraryError && !libraryLoading && libraryModels.length === 0 && (
              <p className="border-b border-line px-4 py-3 text-xs text-ink-muted">
                {showingSearch
                  ? "No models matched that search."
                  : "Could not load popular models."}
              </p>
            )}

            <ul>
              {libraryModels.map((entry) => {
                const installed = isModelInstalled(models, entry.name);
                return (
                  <li
                    key={entry.name}
                    className="border-b border-line last:border-b-0"
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline justify-between gap-3">
                          <p className="truncate text-sm font-medium uppercase tracking-wide text-ink">
                            {entry.name}
                          </p>
                          {entry.sizeLabel && (
                            <p className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">
                              {entry.sizeLabel}
                            </p>
                          )}
                        </div>
                        {entry.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                            {entry.description}
                          </p>
                        )}
                        <p className="mt-2 text-[10px] uppercase tracking-wide text-ink-muted">
                          {[
                            entry.pullsLabel
                              ? `${entry.pullsLabel} pulls`
                              : null,
                            entry.sizes.length > 0
                              ? entry.sizes.slice(0, 5).join(" · ")
                              : null,
                            installed ? "installed" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pulling || cancellingPull || disabled}
                        onClick={() => {
                          requestPull(entry.name, {
                            description: entry.description,
                            sizeLabel: entry.sizeLabel,
                            sizes: entry.sizes,
                          });
                        }}
                        className="shrink-0 border border-line px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
                      >
                        {installed ? "Pull again" : "Pull"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="border-t border-line px-4 py-4">
          <form
            onSubmit={(event) => {
              handlePull(event);
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">
              Pull by exact name
            </p>
            <div className="mt-3 flex items-stretch">
              <input
                type="text"
                value={pullName}
                disabled={pulling || cancellingPull || disabled}
                onChange={(event) => setPullName(event.target.value)}
                placeholder="e.g. llama3.2:3b"
                className="min-w-0 flex-1 border border-line border-r-0 bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:bg-hover disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={
                  pulling || cancellingPull || disabled || !pullName.trim()
                }
                className="shrink-0 border border-line bg-ink px-4 text-xs font-medium uppercase tracking-wide text-paper transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-ink disabled:hover:text-paper"
              >
                Pull
              </button>
            </div>

            {pulling && (
              <div className="mt-3 border border-line px-3 py-3">
                <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                  Downloading {activePullName}
                </p>
                <p className="mt-2 text-xs text-ink">
                  {pullProgress?.status ?? "starting"}
                  {typeof pullProgress?.percent === "number"
                    ? ` · ${pullProgress.percent}%`
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={cancellingPull}
                  onClick={cancelPull}
                  className="mt-3 w-full border border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-40"
                >
                  {cancellingPull ? "Cancelling…" : "Cancel download"}
                </button>
                <p className="mt-2 text-[10px] leading-snug text-ink-muted">
                  Cancel removes this model from your computer.
                </p>
              </div>
            )}

            {pullError && (
              <p className="mt-2 text-xs text-ink">{pullError}</p>
            )}
          </form>
        </section>

        <section className="border-t border-line px-4 py-4">
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">
            Advanced
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Open a system terminal to run Ollama commands directly.
          </p>
          <button
            type="button"
            onClick={() => {
              void handleOpenTerminal();
            }}
            disabled={openingTerminal}
            className="mt-3 w-full border border-line px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {openingTerminal ? "Opening…" : "Open terminal"}
          </button>
          {terminalError && (
            <p className="mt-2 text-xs text-ink">{terminalError}</p>
          )}
        </section>
      </div>
    </aside>
  );
}
