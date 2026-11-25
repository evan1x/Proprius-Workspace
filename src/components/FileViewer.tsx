import { useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/common";
import type { GeneratedFile } from "../services/generatedFiles";

interface FileViewerProps {
  file: GeneratedFile;
  chatTitle: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function highlightCode(content: string, language: string | null): string {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (normalized && hljs.getLanguage(normalized)) {
    return hljs.highlight(content, {
      language: normalized,
      ignoreIllegals: true,
    }).value;
  }
  if (!content.trim()) return "";
  return hljs.highlightAuto(content).value;
}

export function FileViewer({
  file,
  chatTitle,
  onClose,
  onDelete,
}: FileViewerProps) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(
    () => highlightCode(file.content, file.language),
    [file.content, file.language],
  );
  const lineCount = Math.max(1, file.content.split("\n").length);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <section
      aria-label={`File ${file.name}`}
      className="flex min-h-0 flex-1 flex-col bg-paper"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-line bg-surface px-2.5 py-1.5 text-xs font-medium tracking-wide text-ink transition hover:bg-hover"
          >
            Back
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {chatTitle}
              {file.language ? ` · ${file.language}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            className="border border-line bg-surface px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-ink transition hover:bg-hover"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(file.id)}
            className="border border-line px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-danger transition hover:bg-danger/15"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="markdown-body file-view min-h-0 flex-1 overflow-auto">
        <div className="code-block m-0 flex min-h-full min-w-full rounded-none border-0">
          <div
            aria-hidden="true"
            className="file-view-gutter shrink-0 select-none border-r border-white/10 px-3 py-4 text-right"
          >
            {Array.from({ length: lineCount }, (_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
          <pre className="m-0 min-w-0 flex-1 overflow-visible px-4 py-4">
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      </div>
    </section>
  );
}
