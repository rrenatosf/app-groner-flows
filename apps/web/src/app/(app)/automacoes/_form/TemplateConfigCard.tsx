"use client";

import { humanizeKey, TEMPLATE_CONFIG_FIELD_MAP } from "../dados-config-form";

type CatalogoData = {
  baseUrl: string | null;
  n8nWorkflowId: string | null;
};

/** Card especial pro grupo `configuracoes_do_template`. Super-only.
 *  - Renderizado por último na lista de cards.
 *  - Auto-preenchido com valores do catálogo (`automacoes.base_url`,
 *    `automacoes.n8n_workflow_id`) quando vazio.
 *  - Botão "Puxar do template" descarta edições e recarrega valores.
 *  - Quando super edita e salva: write vai pra `automacoes` (catálogo),
 *    não pra `cliente_automacoes` (instância). Persistência feita no
 *    submit do modal pai. */
export function TemplateConfigCard({
  groupValue,
  onChange,
  catalogo,
  disabled,
}: {
  groupValue: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  catalogo?: CatalogoData;
  disabled?: boolean;
}) {
  function pullFromTemplate() {
    if (!catalogo) return;
    if (
      !window.confirm(
        "Descartar valores atuais e puxar do catálogo?\n\nEditar aqui depois sobrescreve o catálogo ao salvar.",
      )
    )
      return;
    const next = { ...groupValue };
    for (const [field, catalogoKey] of Object.entries(
      TEMPLATE_CONFIG_FIELD_MAP,
    )) {
      next[field] = catalogo[catalogoKey] ?? "";
    }
    onChange(next);
  }

  return (
    <div
      className="rounded-md"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--amber-border)",
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderBottom: "1px solid var(--b-soft)" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-[color:var(--fg)]">
            Configurações do template
          </span>
          <span
            className="text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--amber-bg)",
              color: "var(--amber-300)",
              border: "1px solid var(--amber-border)",
            }}
          >
            super-only
          </span>
          <span
            className="text-[10.5px] text-[color:var(--fg-subtle)]"
            title="configuracoes_do_template"
          >
            (configuracoes_do_template)
          </span>
        </div>
        {catalogo && (
          <button
            type="button"
            onClick={pullFromTemplate}
            disabled={disabled}
            className="btn-ghost text-[11px]"
            title="Substitui valores atuais pelos do catálogo. Use quando o catálogo foi atualizado."
          >
            ↻ Puxar do template
          </button>
        )}
      </div>
      <div
        className="px-3 pb-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3"
        style={{ borderTop: "1px solid var(--b-soft)" }}
      >
        {Object.entries(groupValue).map(([key, val]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)] flex items-center flex-wrap gap-x-1">
              <span>{humanizeKey(key)}</span>
              <span
                className="normal-case text-[10px]"
                style={{ color: "var(--fg-subtle)", letterSpacing: 0 }}
              >
                ({key})
              </span>
            </span>
            <input
              type="text"
              value={typeof val === "string" ? val : ""}
              onChange={(e) => {
                onChange({ ...groupValue, [key]: e.target.value });
              }}
              disabled={disabled}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>
        ))}
      </div>
      <div
        className="px-3 py-2 text-[10.5px]"
        style={{
          backgroundColor: "var(--ink-2)",
          color: "var(--fg-subtle)",
          borderTop: "1px solid var(--b-soft)",
        }}
      >
        Atenção: alterações aqui são persistidas no <strong>catálogo</strong>{" "}
        (afeta novas instâncias e cliente atual). Não vão pra config da
        instância.
      </div>
    </div>
  );
}
