"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchBox } from "@/components/search-box";
import {
  ColumnPicker,
  HealthToggle,
  IconInfo,
  PAGE_SIZE_OPTIONS,
  TablePagination,
  useHealthToggle,
  type PageSize,
} from "@/components/data-table";
import {
  updateAgendamentoCell,
  type EditableAgendamentoKey,
} from "./actions";
import { AgendamentoEditModal } from "./agendamento-edit-modal";
import {
  pendenciasFor,
  type AgendamentoRow,
} from "./saude-agendamento";

type ColKey =
  | "tenant"
  | "dataAgendamento"
  | "leadNome"
  | "leadTelefone"
  | "vendedorNome"
  | "statusAgendamento"
  | "observacaoAgendamento"
  | "createdAt"
  | "saude";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  superOnly?: boolean;
  readOnly?: boolean;
  editKind?: "text" | "datetime";
};

const COLUMNS: ColDef[] = [
  { key: "tenant", label: "Cliente", superOnly: true, readOnly: true },
  { key: "dataAgendamento", label: "Quando", editKind: "datetime" },
  { key: "leadNome", label: "Lead", readOnly: true },
  { key: "leadTelefone", label: "Telefone", readOnly: true },
  { key: "vendedorNome", label: "Vendedor", readOnly: true },
  { key: "statusAgendamento", label: "Status", editKind: "text" },
  {
    key: "observacaoAgendamento",
    label: "Observação",
    editKind: "text",
  },
  { key: "createdAt", label: "Criado em", readOnly: true },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
];

const STORAGE_HIDDEN = "groner.agendamentos.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.agendamentos.page_size_v1";
// agendamentos não tem colunas de ação super-only (sem jsonb)

const DEFAULT_VISIBLE: ReadonlySet<ColKey> = new Set([
  "dataAgendamento",
  "leadNome",
  "leadTelefone",
  "vendedorNome",
  "statusAgendamento",
  "observacaoAgendamento",
  "saude",
]);

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dtDateOnly = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return dt.format(v);
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s.length === 0 ? "—" : s;
}

function valueFor(r: AgendamentoRow, key: ColKey): unknown {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "";
  if (key === "saude") return pendenciasFor(r).length;
  if (key === "vendedorNome") return r.vendedorNome ?? "";
  if (key === "createdAt") return r.createdAt ?? null;
  if (key === "dataAgendamento") return r.dataAgendamento ?? null;
  return (r as unknown as Record<string, unknown>)[key];
}

function displayFor(r: AgendamentoRow, key: ColKey): string {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "—";
  if (key === "createdAt")
    return r.createdAt ? dtDateOnly.format(new Date(r.createdAt)) : "—";
  if (key === "dataAgendamento")
    return r.dataAgendamento ? dt.format(new Date(r.dataAgendamento)) : "—";
  if (key === "vendedorNome") return r.vendedorNome ?? "(IA)";
  if (key === "leadNome") return r.leadNome ?? `#${r.leadId ?? "—"}`;
  return fmtVal(valueFor(r, key));
}

function isCellMissing(r: AgendamentoRow, key: ColKey): boolean {
  if (
    key === "tenant" ||
    key === "saude" ||
    key === "vendedorNome" ||
    key === "createdAt" ||
    key === "leadNome" ||
    key === "leadTelefone"
  )
    return false;
  if (key === "dataAgendamento") return r.dataAgendamento === null;
  if (key === "statusAgendamento") {
    const v = r.statusAgendamento;
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  }
  return false;
}

function cmp(av: unknown, bv: unknown): number {
  const aIsNull = av === null || av === undefined || av === "";
  const bIsNull = bv === null || bv === undefined || bv === "";
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;
  if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
}

export function AgendamentosTable({
  rows,
  isSuper,
  canEdit,
  readOnlyReason = null,
  embedded = false,
}: {
  rows: AgendamentoRow[];
  isSuper: boolean;
  canEdit: boolean;
  /** Quando set, renderiza banner explicativo. Cobre drilldowns embedded. */
  readOnlyReason?: "cliente-admin" | null;
  /** Renderiza dentro do drilldown — esconde toolbar redundante. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("agendamentos");
  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter((c) => !c.superOnly || isSuper).filter((c) =>
        showHealth ? true : c.key !== "saude",
      ),
    [isSuper, showHealth],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);

  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    const initial = new Set<ColKey>();
    for (const d of COLUMNS) if (!DEFAULT_VISIBLE.has(d.key)) initial.add(d.key);
    return initial;
  });
  const [storageLoaded, setStorageLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HIDDEN);
      if (raw) {
        const stored = JSON.parse(raw) as ColKey[];
        if (Array.isArray(stored)) {
          setHidden(new Set(stored.filter((k) => visibleKeys.includes(k))));
        }
      }
    } catch {
      /* default já setado */
    }
    setStorageLoaded(true);
  }, [visibleKeys]);
  function persistHidden(next: Set<ColKey>) {
    setHidden(next);
    try {
      localStorage.setItem(STORAGE_HIDDEN, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }
  function toggleHidden(k: ColKey) {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    persistHidden(next);
  }

  // Sort default: dataAgendamento asc (próximo primeiro).
  const [sortKey, setSortKey] = useState<ColKey>("dataAgendamento");
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
      const r = cmp(valueFor(a, sortKey), valueFor(b, sortKey));
      return sortDir === "desc" ? -r : r;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // Filtro super-only por nome do lead.
  const [filtro, setFiltro] = useState("");
  const filteredRows = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) =>
      String(r.leadNome ?? "").toLowerCase().includes(q),
    );
  }, [sortedRows, filtro]);

  // Agrupar por cliente (super-only).
  const [groupByCliente, setGroupByCliente] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  function toggleCollapse(cid: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }
  const grouped = useMemo(() => {
    if (!groupByCliente) return null;
    const map = new Map<
      number,
      {
        clienteId: number;
        clienteNome: string | null;
        clienteTenant: string | null;
        rows: AgendamentoRow[];
      }
    >();
    for (const r of filteredRows) {
      const cid = r.clienteId ?? 0;
      if (!map.has(cid)) {
        map.set(cid, {
          clienteId: cid,
          clienteNome: r.clienteNome,
          clienteTenant: r.clienteTenant,
          rows: [],
        });
      }
      map.get(cid)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
  }, [groupByCliente, filteredRows]);

  // Paginação.
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
  }, [filteredRows.length]);
  const pagedRows = useMemo(
    () => filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [filteredRows, pageIndex, pageSize],
  );

  // Edit inline.
  const [editing, setEditing] = useState<{
    agendamentoId: number;
    key: ColKey;
  } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    setEditing(null);
  }, [rows]);

  // Navegação por setas — célula selecionada {r,c}.
  const [selected, setSelected] = useState<
    { r: number; c: number } | null
  >(null);
  useEffect(() => {
    setSelected(null);
  }, [rows]);

  function startEdit(agendamentoId: number, key: ColKey) {
    setSaveErr(null);
    setEditing({ agendamentoId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | number | boolean | null) {
    if (!editing) return;
    const { agendamentoId, key } = editing;
    startTransition(async () => {
      const editKey = mapColToEditKey(key);
      if (!editKey) {
        setSaveErr("Campo não editável.");
        return;
      }
      const res = await updateAgendamentoCell(agendamentoId, editKey, value);
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setSaveErr(null);
      setEditing(null);
      router.refresh();
    });
  }

  const [editTarget, setEditTarget] = useState<AgendamentoRow | null>(null);

  const orderedDefs = useMemo(
    () => visibleDefs.filter((d) => !hidden.has(d.key)),
    [visibleDefs, hidden],
  );

  const moveSelection = useCallback(
    (dr: number, dc: number) => {
      setSelected((cur) => {
        const maxR = pagedRows.length - 1;
        const maxC = orderedDefs.length - 1;
        if (maxR < 0 || maxC < 0) return cur;
        const r = cur ? cur.r : 0;
        const c = cur ? cur.c : 0;
        const nr = Math.max(0, Math.min(maxR, r + dr));
        const nc = Math.max(0, Math.min(maxC, c + dc));
        return { r: nr, c: nc };
      });
    },
    [pagedRows.length, orderedDefs.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(0, 1);
      } else if (e.key === "Enter" && selected) {
        const def = orderedDefs[selected.c];
        const row = pagedRows[selected.r];
        if (def && row && canEdit && !def.readOnly) {
          e.preventDefault();
          startEdit(row.id, def.key);
        }
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, moveSelection, selected, pagedRows, orderedDefs, canEdit]);

  function renderRow(r: AgendamentoRow, rIdx: number, opts?: { grouped?: boolean }) {
    const inGroup = opts?.grouped === true;

    return (
      <tr
        key={r.id}
        onDoubleClick={() => setEditTarget(r)}
        style={{ cursor: "default" }}
      >
        {orderedDefs.map((d, ci) => {
          const isEditing =
            editing?.agendamentoId === r.id && editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === ci;
          // Vendedor (kind=usuario) edita os mesmos campos do agendamento
          // dos próprios leads — gating fino fica server-side.
          const editable = canEdit && !d.readOnly;

          const tdClass =
            (d.align === "center" ? "text-center" : "") +
            (d.key === "leadNome" ? " font-medium" : "");

          return (
            <td
              key={d.key}
              className={tdClass.trim() || undefined}
              onClick={() => setSelected({ r: rIdx, c: ci })}
              style={{
                position: "relative",
                cursor: editable ? "cell" : "default",
                overflow: isEditing ? "visible" : undefined,
                outline: isCellSelected
                  ? "1px solid var(--mint-300)"
                  : undefined,
                outlineOffset: isCellSelected ? "-1px" : undefined,
                backgroundColor: isCellSelected
                  ? "var(--ink-4)"
                  : undefined,
                borderLeft:
                  inGroup && ci === 0
                    ? "2px solid var(--mint-300)"
                    : undefined,
                paddingLeft: inGroup && ci === 0 ? 14 : undefined,
              }}
            >
              {d.key === "saude" ? (
                <HealthBadge
                  agendamento={r}
                  onOpen={() => setEditTarget(r)}
                />
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  agendamento={r}
                  pending={pending}
                  onCancel={cancelEdit}
                  onCommit={commitEdit}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 group/cell">
                  {d.key === "leadNome" && r.leadId !== null ? (
                    <Link
                      href={`/leads?detail=${r.leadId}`}
                      className="inline-block align-middle hover:text-[color:var(--mint-300)] transition-colors"
                      style={{
                        maxWidth: "25ch",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={displayFor(r, d.key)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayFor(r, d.key)}
                    </Link>
                  ) : (
                    <span
                      className="inline-block align-middle"
                      style={{
                        maxWidth: "25ch",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color:
                          d.key === "vendedorNome" && !r.vendedorNome
                            ? "var(--fg-subtle)"
                            : undefined,
                        fontStyle:
                          d.key === "vendedorNome" && !r.vendedorNome
                            ? "italic"
                            : undefined,
                      }}
                      title={displayFor(r, d.key)}
                    >
                      {displayFor(r, d.key)}
                    </span>
                  )}
                  {showHealth && isCellMissing(r, d.key) && (
                    <span
                      title="Informação faltando"
                      aria-label="Informação faltando"
                      className="inline-flex items-center"
                      style={{ color: "var(--amber-300)" }}
                    >
                      <IconInfo size={12} />
                    </span>
                  )}
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Editar ${d.label}`}
                      title={`Editar ${d.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(r.id, d.key);
                      }}
                      className="text-[13px] leading-none text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      ✎
                    </button>
                  )}
                </span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  if (!storageLoaded) {
    return (
      <div className="px-4 py-6 text-[12px] text-[color:var(--fg-subtle)]">
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {readOnlyReason === "cliente-admin" && embedded && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 py-2 text-[12px]"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-subtle)",
            borderBottom: "1px solid var(--b-soft)",
          }}
        >
          Agendamentos são criados pela IA via fluxo do lead. A edição inline
          está desabilitada pra clientes pra evitar conflitos com automações
          de notificação. Para reagendar, fale com o vendedor responsável ou
          ajuste no CRM.
        </div>
      )}
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
        <div className="flex items-center gap-2 flex-wrap">
          <SearchBox
            compact
            placeholder="Buscar por nome do lead, telefone, status..."
          />
          {isSuper && (
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nome do lead..."
              className="text-[12px] px-2 py-1 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
                height: "26px",
                width: "200px",
              }}
            />
          )}
          {isSuper && (
            <button
              type="button"
              onClick={() => {
                if (!groupByCliente) {
                  setCollapsed(
                    new Set(filteredRows.map((r) => r.clienteId ?? 0)),
                  );
                  setGroupByCliente(true);
                } else {
                  setGroupByCliente(false);
                  setCollapsed(new Set());
                }
              }}
              className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5"
              style={{
                backgroundColor: "var(--ink-3)",
                color: groupByCliente
                  ? "var(--mint-300)"
                  : "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
                height: "26px",
              }}
              title={
                groupByCliente
                  ? "Desagrupar"
                  : "Agrupar agendamentos por cliente"
              }
            >
              <span aria-hidden className="text-[10px]">
                ⊟
              </span>
              <span>{groupByCliente ? "Desagrupar" : "Agrupar"}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            allDefs={visibleDefs}
            hidden={hidden}
            onToggle={toggleHidden}
            onShowAll={() => persistHidden(new Set())}
            onHideAll={() => persistHidden(new Set(visibleKeys))}
          />
          <HealthToggle value={showHealth} onChange={setShowHealth} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-editorial">
          <thead>
            <tr>
              {orderedDefs.map((d) => {
                const isSorted = sortKey === d.key;
                return (
                  <th
                    key={d.key}
                    className={d.align === "center" ? "text-center" : undefined}
                  >
                    <span
                      className="inline-flex items-center gap-1 select-none cursor-pointer"
                      onClick={() => toggleSort(d.key)}
                      title={d.label}
                    >
                      <span
                        className="hover:text-[color:var(--mint-300)] transition-colors"
                        style={{
                          maxWidth: "25ch",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.label}
                      </span>
                      <span className="text-[10px] text-[color:var(--mint-300)]">
                        {isSorted ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!grouped && pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan={orderedDefs.length}
                  className="text-center text-[color:var(--fg-subtle)] py-6"
                >
                  Nenhum agendamento.
                </td>
              </tr>
            )}
            {grouped &&
              grouped.map((g) => {
                const isCollapsed = collapsed.has(g.clienteId);
                return (
                  <Fragment key={g.clienteId}>
                    <tr
                      onClick={() => toggleCollapse(g.clienteId)}
                      style={{
                        backgroundColor: "var(--ink-3)",
                        cursor: "pointer",
                      }}
                    >
                      <td
                        colSpan={orderedDefs.length}
                        style={{
                          padding: "8px 16px",
                          fontSize: "12px",
                          color: "var(--fg)",
                          fontWeight: 500,
                          borderTop: "1px solid var(--b-base)",
                          borderLeft: "2px solid var(--mint-300)",
                        }}
                      >
                        <span style={{ color: "var(--mint-300)", marginRight: 6 }}>
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {g.clienteNome ??
                          g.clienteTenant ??
                          `Cliente #${g.clienteId}`}
                        <span
                          className="numerics ml-2"
                          style={{
                            color: "var(--fg-subtle)",
                            fontSize: "11px",
                          }}
                        >
                          · {g.rows.length} agendamento
                          {g.rows.length === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      g.rows.map((r, i) => renderRow(r, i, { grouped: true }))}
                    {!isCollapsed && (
                      <tr aria-hidden style={{ pointerEvents: "none" }}>
                        <td
                          colSpan={orderedDefs.length}
                          style={{
                            height: 4,
                            padding: 0,
                            borderLeft: "2px solid var(--mint-300)",
                          }}
                        />
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            {!grouped && pagedRows.map((r, i) => renderRow(r, i))}
          </tbody>
        </table>
      </div>

      <div
        className="px-4 py-2 text-[10.5px] flex items-center gap-3 flex-wrap"
        style={{
          color: "var(--fg-subtle)",
          borderTop: "1px solid var(--b-soft)",
        }}
      >
        <span>
          {filteredRows.length} agendamento
          {filteredRows.length === 1 ? "" : "s"}
        </span>
        {pending && <span>· salvando…</span>}
      </div>

      <div
        className="px-4 py-2"
        style={{ borderTop: "1px solid var(--b-soft)" }}
      >
        <TablePagination
          total={filteredRows.length}
          pageSize={pageSize}
          pageIndex={pageIndex}
          onPageSizeChange={persistPageSize}
          onPageIndexChange={setPageIndex}
        />
      </div>

      <AgendamentoEditModal
        open={editTarget !== null}
        target={editTarget}
        isSuper={isSuper}
        canEdit={canEdit}
        onClose={() => setEditTarget(null)}
      />
    </div>
  );
}

function mapColToEditKey(k: ColKey): EditableAgendamentoKey | null {
  if (k === "dataAgendamento") return "dataAgendamento";
  if (k === "statusAgendamento") return "statusAgendamento";
  if (k === "observacaoAgendamento") return "observacaoAgendamento";
  return null;
}

function HealthBadge({
  agendamento,
  onOpen,
}: {
  agendamento: AgendamentoRow;
  onOpen: () => void;
}) {
  const pendentes = pendenciasFor(agendamento);
  const ok = pendentes.length === 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        ok
          ? "Agendamento saudável"
          : `Faltando: ${pendentes.map((p) => p.label).join(", ")}`
      }
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md hover:brightness-110"
      style={{
        backgroundColor: ok ? "var(--ink-3)" : "var(--rose-bg)",
        border: ok
          ? "1px solid var(--b-base)"
          : "1px solid var(--rose-border)",
        color: ok ? "var(--mint-300)" : "var(--rose-300)",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{
          backgroundColor: ok ? "var(--mint-300)" : "var(--rose-300)",
        }}
      />
      <span className="text-[11px]">
        {ok
          ? "ok"
          : `${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"}`}
      </span>
    </button>
  );
}

function CellEditor({
  def,
  agendamento,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  agendamento: AgendamentoRow;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | number | boolean | null) => void;
}) {
  const initial = (() => {
    if (def.key === "dataAgendamento") {
      const v = agendamento.dataAgendamento;
      if (!v) return "";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate(),
      )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const v = (agendamento as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isDatetime = def.editKind === "datetime";

  useEffect(() => {
    if (isDatetime) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [isDatetime]);

  useEffect(() => {
    if (isDatetime) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, isDatetime]);

  function commit() {
    if (isDatetime) {
      if (text.trim() === "") {
        onCommit(null);
        return;
      }
      const d = new Date(text);
      if (Number.isNaN(d.getTime())) return;
      onCommit(d.toISOString());
    } else {
      onCommit(text);
    }
  }

  const dynamicWidth = `${Math.min(80, Math.max(8, text.length + 2))}ch`;

  return (
    <span
      className="inline-flex items-start gap-1"
      style={{ position: "relative", zIndex: 10 }}
    >
      {isDatetime ? (
        <input
          ref={inputRef}
          type="datetime-local"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          disabled={pending}
          className="text-[12.5px] px-1.5 py-0.5 rounded numerics"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--mint-300)",
            color: "var(--fg)",
            outline: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}
        />
      ) : (
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          disabled={pending}
          className="text-[12.5px] px-1.5 py-0.5 rounded min-w-0"
          style={{
            width: dynamicWidth,
            maxWidth: "80ch",
            minHeight: "26px",
            resize: "none",
            overflow: "hidden",
            lineHeight: "1.4",
            fontFamily: "inherit",
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--mint-300)",
            color: "var(--fg)",
            outline: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        />
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        disabled={pending}
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
