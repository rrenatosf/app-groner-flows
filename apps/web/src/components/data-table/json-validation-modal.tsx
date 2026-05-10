"use client";

import { useEffect } from "react";
import { IconCheck, IconWarn } from "./icons";

export type ValidationField = {
  key: string;
  label: string;
  /** Valor esperado (ex: "tipo string", "deve existir", "default 0"). */
  expected: string;
  /** Valor atual no banco/objeto. Stringificado pra exibição. */
  actual: string;
  /** ok = todos batem; warn = divergência. */
  status: "ok" | "warn";
  /** Mensagem extra de divergência (quando warn). */
  detail?: string;
};

/** Modal genérico de validação de shape JSON. Mostra side-by-side do
 *  esperado vs atual, com check verde ou triangulo de alerta por campo.
 *  Aciona `onApply` se o usuário decidir corrigir (super-only). */
export function JsonValidationModal({
  open,
  title,
  subtitle,
  fields,
  pending,
  applyLabel = "Aplicar shape canônico",
  onApply,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  fields: ValidationField[];
  pending?: boolean;
  applyLabel?: string;
  onApply?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const warns = fields.filter((f) => f.status === "warn");
  const allOk = warns.length === 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="w-full max-w-[820px] max-h-[92vh] overflow-y-auto rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow">Validação JSON</div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[16px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div
            className="rounded-md p-3 text-[12px]"
            style={{
              backgroundColor: allOk ? "var(--ink-3)" : "var(--rose-bg)",
              color: allOk ? "var(--fg-muted)" : "var(--rose-300)",
              border: allOk
                ? "1px solid var(--b-base)"
                : "1px solid var(--rose-border)",
            }}
          >
            {allOk ? (
              <>
                <span style={{ color: "var(--mint-300)" }}>✓</span>{" "}
                Todos os campos do JSON batem com o shape esperado pela aplicação.
              </>
            ) : (
              `⚠ ${warns.length} divergência${warns.length === 1 ? "" : "s"} entre o JSON e o shape esperado.`
            )}
          </div>

          <div
            className="rounded-md overflow-hidden"
            style={{ border: "1px solid var(--b-soft)" }}
          >
            <table className="w-full text-[12px]">
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--fg-subtle)",
                  }}
                >
                  <th className="text-left px-3 py-2 font-medium">Campo</th>
                  <th className="text-left px-3 py-2 font-medium">
                    Esperado pela app
                  </th>
                  <th className="text-left px-3 py-2 font-medium">
                    Atual no banco
                  </th>
                  <th
                    className="text-center px-3 py-2 font-medium"
                    style={{ width: "60px" }}
                  >
                    OK
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr
                    key={f.key}
                    style={{
                      borderTop: "1px solid var(--b-soft)",
                      backgroundColor:
                        f.status === "warn"
                          ? "var(--rose-bg)"
                          : undefined,
                    }}
                  >
                    <td className="px-3 py-2 font-medium align-top">
                      {f.label}
                      <div
                        className="text-[10.5px] text-[color:var(--fg-subtle)] numerics"
                        style={{ marginTop: 2 }}
                      >
                        {f.key}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 align-top text-[color:var(--fg-muted)]"
                      style={{ wordBreak: "break-word" }}
                    >
                      {f.expected}
                    </td>
                    <td
                      className="px-3 py-2 align-top numerics"
                      style={{ wordBreak: "break-word" }}
                    >
                      <span
                        style={{
                          color:
                            f.status === "warn"
                              ? "var(--rose-300)"
                              : "var(--fg)",
                        }}
                      >
                        {f.actual}
                      </span>
                      {f.detail && (
                        <div
                          className="text-[10.5px] mt-1"
                          style={{ color: "var(--rose-300)" }}
                        >
                          {f.detail}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-center">
                      {f.status === "ok" ? (
                        <span
                          className="inline-flex"
                          style={{ color: "var(--mint-300)" }}
                        >
                          <IconCheck size={16} />
                        </span>
                      ) : (
                        <span
                          className="inline-flex"
                          style={{ color: "var(--rose-300)" }}
                        >
                          <IconWarn size={16} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[12px] px-3 py-1.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
          >
            Fechar
          </button>
          {!allOk && onApply && (
            <button
              type="button"
              onClick={onApply}
              disabled={pending}
              className="text-[12px] px-3 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--rose-bg)",
                color: "var(--rose-300)",
                border: "1px solid var(--rose-border)",
              }}
            >
              {pending ? "Aplicando…" : applyLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
