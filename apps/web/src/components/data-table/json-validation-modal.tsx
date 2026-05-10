"use client";

import { ModalShell } from "@/components/modal-shell";
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
  const warns = fields.filter((f) => f.status === "warn");
  const allOk = warns.length === 0;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Validação JSON"
      title={title}
      size="full"
      zIndex={55}
      isDirty={false}
      footer={
        <>
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
        </>
      }
    >
        {subtitle && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] px-5 pt-3">
            {subtitle}
          </p>
        )}

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

    </ModalShell>
  );
}
