"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BooleanToggle,
  HealthToggle,
  IconCheck,
  IconWarn,
  PAGE_SIZE_OPTIONS,
  SearchableSelect,
  TablePagination,
  useHealthToggle,
  type PageSize,
} from "@/components/data-table";
import {
  updateClienteAutomacaoCell,
  type EditableInstanciaKey,
} from "../../../automacoes/actions";
import {
  buildInstanciaValidation,
  pendenciasInstanciaFor,
  type InstanciaRowFull,
} from "../../../automacoes/saude-instancia";
import type { Automacao, CrmStatusSlot } from "@/lib/db/schema";
import { InstanciaNovoModal } from "./instancia-novo-modal";
import { InstanciaEditModal } from "./instancia-edit-modal";

type LojaPick = {
  id: string;
  nome: string;
  crm_id?: string | null;
};

type ClientePick = {
  crmTenant: string | null;
  crmToken: string | null;
};

type ColKey =
  | "automacao"
  | "loja"
  | "isActive"
  | "configuracoes"
  | "saude";

const STORAGE_PAGE_SIZE = "groner.cliente_automacoes.page_size_v1";

function cmp(av: unknown, bv: unknown): number {
  const aIsNull = av === null || av === undefined || av === "";
  const bIsNull = bv === null || bv === undefined || bv === "";
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;
  if (typeof av === "boolean" && typeof bv === "boolean") {
    return av === bv ? 0 : av ? -1 : 1;
  }
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", {
    sensitivity: "base",
  });
}

function valueFor(
  r: InstanciaRowFull,
  lojasMap: Map<string, string>,
  key: ColKey,
): unknown {
  if (key === "automacao") return r.catalogoNome ?? "";
  if (key === "loja") return lojasMap.get(r.lojaId) ?? r.lojaId;
  if (key === "isActive") return r.isActive;
  if (key === "configuracoes") {
    return Array.isArray(r.dadosConfiguracoes)
      ? r.dadosConfiguracoes.length
      : 0;
  }
  if (key === "saude") return pendenciasInstanciaFor(r).length;
  return null;
}

export function ClienteAutomacoesTable({
  rows,
  clienteId,
  cliente,
  isSuper,
  canEdit,
  lojas,
  catalogo,
  crmColunas,
  embedded = false,
  embeddedLojaId,
}: {
  rows: InstanciaRowFull[];
  clienteId: number;
  cliente: ClientePick;
  isSuper: boolean;
  canEdit: boolean;
  lojas: LojaPick[];
  catalogo: Automacao[];
  crmColunas: CrmStatusSlot[] | null;
  embedded?: boolean;
  embeddedLojaId?: string;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("cliente-automacoes");
  const lojasMap = useMemo(
    () => new Map(lojas.map((l) => [l.id, l.nome])),
    [lojas],
  );

  const [sortKey, setSortKey] = useState<ColKey>("automacao");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(k: ColKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const r = cmp(valueFor(a, lojasMap, sortKey), valueFor(b, lojasMap, sortKey));
      return sortDir === "desc" ? -r : r;
    });
    return arr;
  }, [rows, sortKey, sortDir, lojasMap]);

  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PAGE_SIZE);
      if (!raw) return;
      const n = Number(raw);
      if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) {
        setPageSize(n as PageSize);
      }
    } catch {
      /* ignore */
    }
  }, []);
  function persistPageSize(n: PageSize) {
    setPageSize(n);
    try {
      localStorage.setItem(STORAGE_PAGE_SIZE, String(n));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    setPageIndex(0);
  }, [sortedRows.length]);
  const pagedRows = useMemo(
    () => sortedRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [sortedRows, pageIndex, pageSize],
  );

  const [pending, startTransition] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [editingLojaId, setEditingLojaId] = useState<number | null>(null);

  function commitCell(
    instanciaId: number,
    key: EditableInstanciaKey,
    value: string | boolean | null,
  ) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateClienteAutomacaoCell(instanciaId, key, value);
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setEditingLojaId(null);
      router.refresh();
    });
  }

  function toggleBoolean(instanciaId: number, current: boolean) {
    commitCell(instanciaId, "isActive", !current);
  }

  const [novoOpen, setNovoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InstanciaRowFull | null>(null);

  return (
    <div className="space-y-2">
      {saveErr && (
        <div
          className="px-4 py-2 text-[12px]"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            borderBottom: "1px solid var(--amber-border)",
          }}
        >
          {saveErr}
        </div>
      )}
      <div
        className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderBottom: "1px solid var(--b-soft)" }}
      >
        <div className="text-[12px] text-[color:var(--fg-muted)]">
          {sortedRows.length} automaç
          {sortedRows.length === 1 ? "ão" : "ões"} atribuída
          {sortedRows.length === 1 ? "" : "s"}
          {embedded && embeddedLojaId
            ? " · escopo da loja"
            : ""}
        </div>
        <div className="flex items-center gap-2">
          <HealthToggle value={showHealth} onChange={setShowHealth} />
          {canEdit && (
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="chip chip-mint text-[12px] px-2.5 py-1"
              style={{ height: "26px" }}
            >
              <span aria-hidden className="text-[11px]">
                ＋
              </span>
              <span>Adicionar automação</span>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-editorial">
          <thead>
            <tr>
              <Th label="Automação" k="automacao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Loja" k="loja" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Ativa" k="isActive" align="center" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Configurações" k="configuracoes" align="center" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {showHealth && (
                <Th label="Saúde" k="saude" align="center" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              )}
              <th className="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan={showHealth ? 6 : 5}
                  className="text-center text-[color:var(--fg-subtle)] py-6"
                >
                  Nenhuma automação atribuída ainda.
                </td>
              </tr>
            )}
            {pagedRows.map((r) => {
              const isEditingLoja = editingLojaId === r.id;
              const lojaTravada =
                embedded && embeddedLojaId !== undefined;
              return (
                <tr
                  key={r.id}
                  onDoubleClick={() => setEditTarget(r)}
                  style={{ cursor: "default" }}
                >
                  <td className="font-medium">
                    <span title={r.catalogoNome ?? ""}>
                      {r.catalogoNome ?? "—"}
                      {r.catalogoVersao ? (
                        <span
                          className="ml-1.5 text-[11px]"
                          style={{ color: "var(--fg-subtle)" }}
                        >
                          v{r.catalogoVersao}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {isEditingLoja && canEdit && !lojaTravada ? (
                      <LojaEditor
                        lojas={lojas}
                        current={r.lojaId}
                        pending={pending}
                        onCancel={() => setEditingLojaId(null)}
                        onCommit={(v) => commitCell(r.id, "lojaId", v)}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 group/cell">
                        <span>{lojasMap.get(r.lojaId) ?? r.lojaId}</span>
                        {canEdit && !lojaTravada && (
                          <button
                            type="button"
                            aria-label="Editar loja"
                            title="Editar loja"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLojaId(r.id);
                            }}
                            className="text-[13px] leading-none text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity"
                          >
                            ✎
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    {canEdit ? (
                      <BooleanToggle
                        value={!!r.isActive}
                        pending={pending}
                        offIsAlert
                        ariaLabel="Ativa"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBoolean(r.id, !!r.isActive);
                        }}
                      />
                    ) : (
                      <span>{r.isActive ? "sim" : "não"}</span>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget(r);
                      }}
                      className="text-[11px] px-1.5 py-0.5 rounded-md hover:brightness-110"
                      style={{
                        backgroundColor: "var(--ink-3)",
                        color: "var(--fg-muted)",
                        border: "1px solid var(--b-soft)",
                      }}
                    >
                      {Array.isArray(r.dadosConfiguracoes)
                        ? r.dadosConfiguracoes.length
                        : 0}{" "}
                      grupo
                      {Array.isArray(r.dadosConfiguracoes) &&
                      r.dadosConfiguracoes.length === 1
                        ? ""
                        : "s"}
                    </button>
                  </td>
                  {showHealth && (
                    <td className="text-center">
                      <HealthBadge
                        instancia={r}
                        onOpen={() => setEditTarget(r)}
                      />
                    </td>
                  )}
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => setEditTarget(r)}
                      className="text-[11px] px-2 py-0.5 rounded-md hover:brightness-110"
                      style={{
                        backgroundColor: "var(--ink-3)",
                        color: "var(--fg-muted)",
                        border: "1px solid var(--b-soft)",
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="px-4 py-2"
        style={{ borderTop: "1px solid var(--b-soft)" }}
      >
        <TablePagination
          total={sortedRows.length}
          pageSize={pageSize}
          pageIndex={pageIndex}
          onPageSizeChange={persistPageSize}
          onPageIndexChange={setPageIndex}
        />
      </div>

      {canEdit && (
        <InstanciaNovoModal
          open={novoOpen}
          clienteId={clienteId}
          cliente={cliente}
          isSuper={isSuper}
          lojas={lojas}
          catalogo={catalogo}
          crmColunas={crmColunas}
          forcedLojaId={embeddedLojaId}
          onClose={() => setNovoOpen(false)}
        />
      )}
      <InstanciaEditModal
        open={editTarget !== null}
        target={editTarget}
        canEdit={canEdit}
        isSuper={isSuper}
        clienteId={clienteId}
        cliente={cliente}
        lojas={lojas}
        crmColunas={crmColunas}
        embeddedLojaId={embeddedLojaId}
        onClose={() => setEditTarget(null)}
      />
    </div>
  );
}

function Th({
  label,
  k,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: ColKey;
  align?: "left" | "center" | "right";
  sortKey: ColKey;
  sortDir: "asc" | "desc";
  onSort: (k: ColKey) => void;
}) {
  const isSorted = sortKey === k;
  return (
    <th className={align === "center" ? "text-center" : undefined}>
      <span
        className="inline-flex items-center gap-1 select-none cursor-pointer"
        onClick={() => onSort(k)}
        title={label}
      >
        <span className="hover:text-[color:var(--mint-300)] transition-colors">
          {label}
        </span>
        <span className="text-[10px] text-[color:var(--mint-300)]">
          {isSorted ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </span>
    </th>
  );
}

function HealthBadge({
  instancia,
  onOpen,
}: {
  instancia: InstanciaRowFull;
  onOpen: () => void;
}) {
  const fields = buildInstanciaValidation(instancia);
  const warns = fields.filter(
    (f: { status: "ok" | "warn" }) => f.status === "warn",
  ).length;
  const ok = warns === 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={ok ? "Saúde ok" : `${warns} alerta${warns === 1 ? "" : "s"}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:brightness-110"
      style={{
        backgroundColor: ok ? "var(--ink-3)" : "var(--rose-bg)",
        border: ok
          ? "1px solid var(--b-base)"
          : "1px solid var(--rose-border)",
        color: ok ? "var(--mint-300)" : "var(--rose-300)",
        cursor: "pointer",
      }}
    >
      {ok ? <IconCheck size={14} /> : <IconWarn size={14} />}
      <span className="text-[11px]">{ok ? "ok" : `${warns}`}</span>
    </button>
  );
}

function LojaEditor({
  lojas,
  current,
  pending,
  onCancel,
  onCommit,
}: {
  lojas: LojaPick[];
  current: string;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState<string | null>(current ?? null);
  function commit() {
    if (!value) return;
    onCommit(value);
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ position: "relative", zIndex: 10 }}
    >
      <SearchableSelect<LojaPick, string>
        items={lojas}
        value={value}
        onChange={(k) => setValue(k)}
        getKey={(l) => l.id}
        getLabel={(l) => l.nome}
        placeholder="Selecione a loja…"
        searchPlaceholder="Buscar loja…"
        disabled={pending}
        width={240}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        disabled={pending || !value}
        className="text-[10px] text-[color:var(--mint-300)]"
      >
        ✓
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        disabled={pending}
        className="text-[10px] text-[color:var(--fg-subtle)]"
      >
        ✕
      </button>
    </span>
  );
}
