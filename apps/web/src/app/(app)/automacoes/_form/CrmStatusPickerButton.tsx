"use client";

import { useRef } from "react";
import { SearchableSelect } from "@/components/data-table";
import type { CrmStatus } from "@/server/actions/cliente-crm";
import { useCrmCtx } from "./crm-ctx";

/** Dropdown SEMPRE visível pra picker de status do CRM. Lazy fetch ao
 *  primeiro foco/clique no select (em vez de mount), pra evitar batidas
 *  no CRM em templates que têm vários objetos crm_status mas o user
 *  abre só alguns.
 *
 *  Mapeia ao selecionar (4 campos):
 *  - crm_etapa_id / crm_etapa_nome
 *  - crm_status_id / crm_status_nome
 *  NÃO toca crm_status_slug nem crm_status_tipo (vêm do template). */
export function CrmStatusPickerButton({
  inner,
  onChange,
  disabled,
}: {
  inner: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const { liveList, pendingLive, liveErr, refreshLive } = useCrmCtx();
  const fetchedOnceRef = useRef(false);

  function ensureFetched() {
    if (fetchedOnceRef.current) return;
    if (liveList !== null) return;
    if (pendingLive) return;
    fetchedOnceRef.current = true;
    refreshLive();
  }

  const currentId =
    typeof inner.crm_status_id === "string" ? inner.crm_status_id : "";

  return (
    <div
      className="inline-flex items-center gap-1.5"
      onMouseDown={ensureFetched}
      onFocus={ensureFetched}
    >
      <SearchableSelect<CrmStatus, string>
        items={liveList ?? []}
        value={currentId || null}
        onChange={(id) => {
          if (!id) return;
          const live = (liveList ?? []).find((x) => x.id === id);
          if (!live) return;
          onChange({
            ...inner,
            crm_etapa_id: live.etapaId ?? "",
            crm_etapa_nome: live.etapaNome ?? "",
            crm_status_id: live.id,
            crm_status_nome: live.nome,
          });
        }}
        getKey={(c) => c.id}
        getLabel={(c) =>
          `${c.nome || `(sem nome) #${c.id}`} · ${c.etapaNome || "(sem etapa)"}`
        }
        placeholder={
          pendingLive
            ? "Carregando colunas do CRM…"
            : liveErr
              ? "Erro ao carregar — clique no ↻"
              : liveList === null
                ? "Buscar status no CRM"
                : liveList.length === 0
                  ? "CRM sem colunas"
                  : "Selecionar status do CRM"
        }
        searchPlaceholder={
          pendingLive ? "Aguarde, carregando…" : "Buscar status..."
        }
        disabled={disabled || !!liveErr}
        width={260}
        align="right"
      />
      {liveErr && (
        <button
          type="button"
          onClick={() => {
            fetchedOnceRef.current = false;
            refreshLive();
          }}
          disabled={pendingLive}
          className="text-[10.5px] px-1.5 py-0.5 rounded-md"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
          title={liveErr}
        >
          ↻
        </button>
      )}
    </div>
  );
}
