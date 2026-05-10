"use client";

import { SearchableSelect } from "@/components/data-table";
import type { CrmStatus } from "@/server/actions/cliente-crm";
import type { CrmStatusSlot } from "@/lib/db/schema";
import { detectColunaTipo, slugifyFromNome } from "../dados-config-form";

/** Picker LIVE pra grupos `coluna_*`. Substitui ColunaPicker antigo
 *  (que usava só cache do banco). Aqui cruza:
 *
 *  - `liveList`: status do CRM em tempo real (com etapa) — fonte de
 *    verdade do que existe no kanban agora.
 *  - `cachedColunas`: slots cadastrados pelo cliente (com slug+tipo) —
 *    diz quais foram "promovidos" pra serem usáveis em automação.
 *
 *  Filtragem B1: só mostra status que existem AMBOS no live E no cache
 *  do tipo correspondente. Isso evita que automação aponte pra coluna
 *  que o cliente nunca cadastrou (sem slug/tipo) ou que sumiu do CRM.
 *
 *  Ao selecionar, preenche os 4 canonical (id/nome/slug/tipo) + 2 extras
 *  (etapa_id/etapa_nome) — passthrough do shape aceita.
 */
export function ColunaPickerLive({
  groupName,
  groupValue,
  onChange,
  liveList,
  cachedColunas,
  pending,
  fetchError,
  onRefresh,
  disabled,
}: {
  groupName: string;
  groupValue: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  liveList: CrmStatus[] | null;
  cachedColunas: CrmStatusSlot[] | null;
  pending: boolean;
  fetchError: string | null;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  const tipo = detectColunaTipo(groupName);
  if (!tipo) return null;

  const valorAtualId =
    typeof groupValue.id === "string" ? groupValue.id : "";

  const cacheArr = cachedColunas ?? [];
  const cacheDoTipo = cacheArr.filter((c) => c.tipo === tipo);
  const cacheById = new Map(cacheArr.map((c) => [c.id, c]));

  // B2: lista live COMPLETA, sem filtrar pelo cache. O cache vira só
  // um indicador visual (badge "já no seu cache" / "no seu cache como
  // outro tipo") — não trava a seleção. Permite selecionar qualquer
  // coluna que existe no CRM agora, mesmo se ainda não foi promovida.
  const liveArr = liveList ?? [];
  const itemsFiltrados = liveArr;

  const cacheVazio = cacheArr.length === 0;
  const cacheSemTipo = !cacheVazio && cacheDoTipo.length === 0;
  // Live sem nenhum item disponível (CRM vazio).
  const liveSemMatch =
    !pending &&
    !fetchError &&
    liveList !== null &&
    itemsFiltrados.length === 0;

  const isLoading = liveList === null && pending;

  return (
    <div className="flex flex-col gap-1.5">
      <SearchableSelect<CrmStatus, string>
        items={itemsFiltrados}
        value={valorAtualId || null}
        onChange={(id) => {
          if (!id) {
            onChange({
              ...groupValue,
              id: "",
              nome: "",
              slug: "",
              tipo,
              etapa_id: "",
              etapa_nome: "",
            });
            return;
          }
          const live = liveArr.find((x) => x.id === id);
          if (!live) return;
          const cached = cacheById.get(id);
          // Slug: usa cache do tipo correto se existir; senão deriva
          // do nome live + sufixo do tipo. Tipo é sempre o do grupo
          // (groupName), não o do cache — evita herdar tipo errado
          // se a coluna foi cadastrada como outro slot.
          const slug =
            cached && cached.tipo === tipo
              ? cached.slug
              : slugifyFromNome(live.nome, tipo);
          onChange({
            ...groupValue,
            id: live.id,
            nome: live.nome,
            slug,
            tipo,
            etapa_id: live.etapaId ?? "",
            etapa_nome: live.etapaNome ?? "",
          });
        }}
        getKey={(c) => c.id}
        getLabel={(c) =>
          `${c.nome || `(sem nome) #${c.id}`} · ${c.etapaNome || "(sem etapa)"}`
        }
        placeholder={
          isLoading
            ? "Carregando colunas do CRM…"
            : fetchError
              ? "Falha ao carregar colunas (clique em recarregar)"
              : liveSemMatch
                ? "CRM não retornou nenhuma coluna"
                : "Selecione a coluna"
        }
        searchPlaceholder="Buscar coluna..."
        disabled={
          disabled || isLoading || !!fetchError || liveSemMatch
        }
        width={400}
      />

      {fetchError && (
        <div
          className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-md"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
        >
          <span className="truncate" title={fetchError}>
            {fetchError}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || pending}
            className="text-[10.5px] px-1.5 py-0.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {pending ? "…" : "Recarregar"}
          </button>
        </div>
      )}

      {(cacheVazio || cacheSemTipo) && !fetchError && (
        <p
          className="text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {cacheVazio
            ? "Cliente ainda não cadastrou colunas no cache. Você pode selecionar direto do CRM aqui — o slug é gerado automaticamente."
            : `Nenhuma coluna do tipo "${tipo}" cadastrada no cache. Selecione direto do CRM — o slug é gerado automaticamente.`}
        </p>
      )}

      {liveSemMatch && !fetchError && (
        <p className="text-[11px]" style={{ color: "var(--amber-300)" }}>
          O CRM não retornou nenhuma coluna agora. Verifique conexão ou
          recarregue.
        </p>
      )}

      {valorAtualId &&
        (() => {
          const cached = cacheById.get(valorAtualId);
          return (
            <div
              className="text-[11px] px-2 py-1 rounded-md grid grid-cols-2 sm:grid-cols-4 gap-2 numerics"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg-muted)",
              }}
            >
              <span>
                <span className="text-[color:var(--fg-subtle)]">slug:</span>{" "}
                {String(groupValue.slug ?? "")}
              </span>
              <span>
                <span className="text-[color:var(--fg-subtle)]">tipo:</span>{" "}
                {String(groupValue.tipo ?? tipo)}
              </span>
              <span className="truncate" title={String(groupValue.id ?? "")}>
                <span className="text-[color:var(--fg-subtle)]">id:</span>{" "}
                {String(groupValue.id ?? "")}
              </span>
              <span
                className="truncate"
                title={String(groupValue.etapa_nome ?? "")}
              >
                <span className="text-[color:var(--fg-subtle)]">etapa:</span>{" "}
                {String(groupValue.etapa_nome ?? "—")}
              </span>
              {cached && cached.tipo === tipo && (
                <span
                  className="sm:col-span-4"
                  style={{ color: "var(--mint-300)" }}
                >
                  já no seu cache
                </span>
              )}
              {cached && cached.tipo !== tipo && (
                <span
                  className="sm:col-span-4"
                  style={{ color: "var(--amber-300)" }}
                >
                  no seu cache como &quot;{cached.tipo}&quot;
                </span>
              )}
              {!cached && (
                <span
                  className="sm:col-span-4"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  não está no cache do cliente — slug gerado automaticamente
                </span>
              )}
            </div>
          );
        })()}
    </div>
  );
}
