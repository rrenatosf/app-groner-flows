"use client";

import { useState } from "react";
import { useDebug } from "@/lib/debug/context";

function IconBug({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 2l1.88 1.88" />
      <path d="M14.12 3.88L16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 0 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

export function DebugToggle() {
  const { enabled, available, setEnabled } = useDebug();
  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-label="Toggle debug"
      aria-pressed={enabled}
      title={enabled ? "Debug ON · click pra desligar" : "Debug OFF · click pra ligar"}
      className={
        "inline-flex items-center justify-center size-7 rounded-md transition-colors hover:bg-[color:var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mint-300)] " +
        (enabled
          ? "text-[color:var(--mint-300)]"
          : "text-[color:var(--fg-subtle)]")
      }
      style={{
        filter: enabled ? "drop-shadow(0 0 4px rgba(70,200,154,0.5))" : "none",
      }}
    >
      <IconBug />
    </button>
  );
}

export function DebugPanel() {
  const { enabled, logs, clear, available } = useDebug();
  const [collapsed, setCollapsed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  function formatEntry(l: { ts: number; label: string; data: unknown; url?: string; userAgent?: string }) {
    const t = new Date(l.ts).toISOString();
    return [
      `[${t}] ${l.label}`,
      l.url ? `  url: ${l.url}` : null,
      l.userAgent ? `  ua: ${l.userAgent}` : null,
      `  data:`,
      safeStringify(l.data ?? null)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  function copyAll() {
    const text = logs.map(formatEntry).join("\n\n---\n\n");
    void copyToClipboard(text).then((ok) => {
      setCopyState(ok ? "ok" : "fail");
      setTimeout(() => setCopyState("idle"), 1400);
    });
  }

  function copyEntry(l: { ts: number; label: string; data: unknown; url?: string; userAgent?: string }) {
    void copyToClipboard(formatEntry(l));
  }

  if (!available || !enabled) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-[100] rounded-md text-[11px] font-mono"
      style={{
        backgroundColor: "color-mix(in oklab, var(--ink-1) 92%, transparent)",
        border: "1px solid var(--mint-700)",
        boxShadow: "0 0 12px rgba(70,200,154,0.25)",
        width: collapsed ? "auto" : "min(440px, calc(100vw - 24px))",
        maxHeight: collapsed ? "auto" : "40vh",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1.5"
        style={{ borderBottom: collapsed ? "none" : "1px solid var(--b-soft)" }}
      >
        <span className="flex items-center gap-1.5 text-[color:var(--mint-300)]">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "var(--mint-300)" }}
          />
          DEBUG · {logs.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyAll}
            disabled={logs.length === 0}
            className="text-[10px] px-1.5 py-0.5 rounded hover:text-[color:var(--fg)] text-[color:var(--fg-subtle)] disabled:opacity-40"
            title="Copiar todos os eventos para o clipboard"
          >
            {copyState === "ok"
              ? "✓ copiado"
              : copyState === "fail"
                ? "falhou"
                : "copiar tudo"}
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-[10px] px-1.5 py-0.5 rounded hover:text-[color:var(--fg)] text-[color:var(--fg-subtle)]"
          >
            limpar
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] px-1.5 py-0.5 rounded hover:text-[color:var(--fg)] text-[color:var(--fg-subtle)]"
          >
            {collapsed ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="overflow-auto" style={{ maxHeight: "calc(40vh - 32px)" }}>
          {logs.length === 0 ? (
            <div className="px-3 py-4 text-[color:var(--fg-subtle)] text-center">
              Aguardando eventos... interaja com a UI.
            </div>
          ) : (
            <ul>
              {logs
                .slice()
                .reverse()
                .map((l, idx) => {
                  const t = new Date(l.ts);
                  const ts = `${String(t.getHours()).padStart(2, "0")}:${String(
                    t.getMinutes(),
                  ).padStart(2, "0")}:${String(t.getSeconds()).padStart(
                    2,
                    "0",
                  )}.${String(t.getMilliseconds()).padStart(3, "0")}`;
                  return (
                    <li
                      key={`${l.ts}-${idx}`}
                      className="px-2.5 py-1.5 group"
                      style={{ borderBottom: "1px solid var(--b-soft)" }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-[9.5px] text-[color:var(--fg-subtle)] numerics shrink-0">
                          {ts}
                        </span>
                        <span className="text-[color:var(--mint-300)] truncate flex-1">
                          {l.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyEntry(l)}
                          title="Copiar este evento"
                          className="text-[9.5px] px-1.5 rounded text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          ⎘
                        </button>
                      </div>
                      <pre
                        className="mt-1 text-[10.5px] leading-tight whitespace-pre-wrap break-all"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {safeStringify(l.data ?? "(sem payload)")}
                      </pre>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function safeStringify(d: unknown) {
  try {
    return JSON.stringify(d, null, 2);
  } catch {
    return String(d);
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback (HTTP / older browsers)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
