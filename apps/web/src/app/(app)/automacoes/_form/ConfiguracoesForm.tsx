"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmStatusSlot } from "@/lib/db/schema";
import {
  type CrmStatus,
  fetchCrmFunisAction,
  fetchCrmFunisForClienteAction,
} from "@/server/actions/cliente-crm";
import {
  countPendentes,
  hasColunaAnywhere,
  isTemplateConfigGroup,
  TEMPLATE_CONFIG_FIELD_MAP,
} from "../dados-config-form";
import { CrmCtx } from "./crm-ctx";
import {
  type DadosConfigGroup,
  validateDadosConfiguracoes,
} from "../dados-config-shape";
import { GroupCard } from "./GroupCard";
import { PendenciasBadge } from "./PendenciasBadge";
import { TemplateConfigCard } from "./TemplateConfigCard";

type CatalogoData = {
  baseUrl: string | null;
  n8nWorkflowId: string | null;
};

/** Form visual pra configurações de instância de automação. Renderiza
 *  cada grupo como card colapsável; campos inferidos por kind do valor
 *  inicial. Inclui fallback "Editar JSON cru" pra unblock casos
 *  unsupported (objeto aninhado, array misto). Ao voltar do JSON pro
 *  visual, faz parse + validate; só aplica se válido.
 *
 *  Faz fetch único do CRM live (com etapa) ao mount — todos os
 *  ColunaPickerLive abaixo reusam o resultado. Otimização: só fetch
 *  se template tem pelo menos 1 grupo `coluna_*`. */
export function ConfiguracoesForm({
  value,
  onChange,
  crmColunas,
  clienteId,
  isSuper,
  catalogo,
  disabled,
  showRawJsonToggle = true,
}: {
  value: DadosConfigGroup[];
  onChange: (next: DadosConfigGroup[]) => void;
  crmColunas: CrmStatusSlot[] | null;
  clienteId: number;
  isSuper: boolean;
  /** Quando há instância vinculada a catálogo, valores atuais do
   *  catálogo (passados pra TemplateConfigCard pra autofill e botão
   *  "Puxar do template"). Só usado quando isSuper=true. */
  catalogo?: CatalogoData;
  disabled?: boolean;
  showRawJsonToggle?: boolean;
}) {
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState<string>("");
  const [rawErr, setRawErr] = useState<string | null>(null);

  // Live CRM state (lift único — reusa entre todos os pickers).
  const [liveList, setLiveList] = useState<CrmStatus[] | null>(null);
  const [pendingLive, setPendingLive] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);

  // Otimização: só fetch se houver grupo/subgrupo `coluna_*` em qualquer
  // profundidade. Walk recursivo via `hasColunaAnywhere`.
  const hasColunaGroup = useMemo(
    () => hasColunaAnywhere(value),
    [value],
  );

  const refreshLive = useCallback(async () => {
    setPendingLive(true);
    setLiveErr(null);
    try {
      const res = isSuper
        ? await fetchCrmFunisForClienteAction(clienteId)
        : await fetchCrmFunisAction();
      if (res.ok) {
        setLiveList(res.statusList);
      } else {
        setLiveErr(res.error);
      }
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingLive(false);
    }
  }, [clienteId, isSuper]);

  // Reset defensivo: quando troca de cliente/persona, descarta liveList
  // pra forçar refetch no próximo effect. Evita vazar dados cross-tenant
  // se o componente for reusado entre clientes diferentes (caso super
  // navega entre instâncias de tenants distintos sem unmount).
  useEffect(() => {
    setLiveList(null);
    setLiveErr(null);
  }, [clienteId, isSuper]);

  // Fetch ao mount / quando clienteId muda. Só se tem coluna group e
  // ainda não carregou. Skip se disabled (vendedor read-only) — evita
  // RTT inútil que vai falhar com requireOwner.
  useEffect(() => {
    if (disabled) return;
    if (!hasColunaGroup) return;
    if (liveList !== null) return;
    if (pendingLive) return;
    void refreshLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasColunaGroup, clienteId, isSuper, disabled]);

  // Quando entra no rawMode, popula textarea com JSON pretty.
  useEffect(() => {
    if (rawMode) {
      try {
        setRawText(JSON.stringify(value, null, 2));
      } catch {
        setRawText("[]");
      }
      setRawErr(null);
    }
  }, [rawMode, value]);

  // Auto-fill do bloco configuracoes_do_template com valores do catálogo
  // (só pra super; cliente comum nem vê o bloco). Só preenche campos
  // vazios — não sobrescreve edição feita pelo super.
  useEffect(() => {
    if (!isSuper || !catalogo) return;
    const idx = value.findIndex((g) => {
      const name = Object.keys(g)[0];
      return typeof name === "string" && isTemplateConfigGroup(name);
    });
    if (idx < 0) return;
    const groupName = Object.keys(value[idx])[0];
    if (!groupName) return;
    const inner = { ...(value[idx][groupName] as Record<string, unknown>) };
    let changed = false;
    for (const [field, catalogoKey] of Object.entries(
      TEMPLATE_CONFIG_FIELD_MAP,
    )) {
      const current = inner[field];
      const isEmpty = current === "" || current == null;
      const candidate = catalogo[catalogoKey];
      if (isEmpty && candidate) {
        inner[field] = candidate;
        changed = true;
      }
    }
    if (changed) {
      const next = value.slice();
      next[idx] = { [groupName]: inner } as DadosConfigGroup;
      onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, isSuper]);

  const { total, perGroup } = useMemo(() => countPendentes(value), [value]);

  function updateGroup(idx: number, nextInner: Record<string, unknown>) {
    const groupName = Object.keys(value[idx] ?? {})[0];
    if (!groupName) return;
    const next = value.slice();
    next[idx] = { [groupName]: nextInner };
    onChange(next);
  }

  function applyRawJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      setRawErr(
        `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    const v = validateDadosConfiguracoes(parsed);
    if (!v.ok) {
      setRawErr(v.error);
      return;
    }
    onChange(v.v);
    setRawErr(null);
    setRawMode(false);
  }

  const crmCtxValue = useMemo(
    () => ({
      crmColunas,
      liveList,
      pendingLive,
      liveErr,
      refreshLive,
    }),
    [crmColunas, liveList, pendingLive, liveErr, refreshLive],
  );

  return (
    <CrmCtx.Provider value={crmCtxValue}>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
            Configurações
          </span>
          <PendenciasBadge count={total} />
          <span className="text-[11px] text-[color:var(--fg-subtle)]">
            {value.length} grupo{value.length === 1 ? "" : "s"}
          </span>
        </div>
        {showRawJsonToggle && (
          <button
            type="button"
            onClick={() => setRawMode((s) => !s)}
            disabled={disabled}
            className="text-[11px] px-2 py-1 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
            title={
              rawMode
                ? "Voltar pro form visual"
                : "Editar como JSON cru (avançado)"
            }
          >
            {rawMode ? "Voltar pro form" : "Editar JSON cru"}
          </button>
        )}
      </div>

      {rawMode ? (
        <div className="space-y-2">
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setRawErr(null);
            }}
            disabled={disabled}
            rows={16}
            spellCheck={false}
            className="w-full text-[12.5px] px-2.5 py-1.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              border: rawErr
                ? "1px solid var(--rose-border)"
                : "1px solid var(--b-soft)",
              color: "var(--fg)",
              outline: "none",
              resize: "vertical",
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              lineHeight: "1.6",
              minHeight: "320px",
              tabSize: 2,
            }}
          />
          {rawErr && (
            <div
              className="text-[12px] px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--rose-bg)",
                color: "var(--rose-300)",
                border: "1px solid var(--rose-border)",
              }}
            >
              {rawErr}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRawMode(false);
                setRawErr(null);
              }}
              disabled={disabled}
              className="text-[12px] px-3 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
            >
              Descartar e voltar
            </button>
            <button
              type="button"
              onClick={applyRawJson}
              disabled={disabled}
              className="chip chip-mint text-[12px] px-3 py-1.5"
            >
              Aplicar JSON
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {value.length === 0 && (
            <p
              className="text-[11.5px] px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-base)",
              }}
            >
              Nenhum grupo definido. Use &quot;Editar JSON cru&quot; pra colar
              um template, ou aplique o template padrão do catálogo.
            </p>
          )}
          {(() => {
            // Split: grupos principais primeiro, configuracoes_do_template
            // por último (e só visível pra super). Mantém o índice
            // original pra updateGroup continuar usando o slot certo.
            const mainGroups: Array<{ g: DadosConfigGroup; idx: number }> = [];
            let templateGroup: { g: DadosConfigGroup; idx: number } | null =
              null;
            value.forEach((g, idx) => {
              const name = Object.keys(g)[0];
              if (typeof name === "string" && isTemplateConfigGroup(name)) {
                if (!templateGroup) templateGroup = { g, idx };
                else mainGroups.push({ g, idx });
              } else {
                mainGroups.push({ g, idx });
              }
            });
            return (
              <>
                {mainGroups.map(({ g: groupObj, idx }) => {
                  const groupName = Object.keys(groupObj)[0];
                  if (!groupName) return null;
                  const groupValue = groupObj[groupName] ?? {};
                  const pendCount = perGroup[groupName] ?? 0;
                  return (
                    <GroupCard
                      key={`${groupName}-${idx}`}
                      groupName={groupName}
                      groupValue={groupValue}
                      onChange={(nextInner) => updateGroup(idx, nextInner)}
                      pendencias={pendCount}
                      disabled={disabled}
                    />
                  );
                })}
                {isSuper && templateGroup && (() => {
                  const tg = templateGroup as {
                    g: DadosConfigGroup;
                    idx: number;
                  };
                  const groupName = Object.keys(tg.g)[0];
                  if (!groupName) return null;
                  const groupValue = (tg.g[groupName] ?? {}) as Record<
                    string,
                    unknown
                  >;
                  return (
                    <TemplateConfigCard
                      key={`tpl-${tg.idx}`}
                      groupValue={groupValue}
                      onChange={(nextInner) => updateGroup(tg.idx, nextInner)}
                      catalogo={catalogo}
                      disabled={disabled}
                    />
                  );
                })()}
              </>
            );
          })()}
        </div>
      )}
    </div>
    </CrmCtx.Provider>
  );
}
