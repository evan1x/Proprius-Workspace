import { useState, type ReactNode } from "react";

interface CodeBlockProps {
  language?: string;
  children: ReactNode;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = extractText(children).replace(/\n$/, "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div className="code-block my-3 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          className="shrink-0 border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink transition hover:bg-hover"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto bg-transparent px-3.5 py-3.5">{children}</pre>
    </div>
  );
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}
