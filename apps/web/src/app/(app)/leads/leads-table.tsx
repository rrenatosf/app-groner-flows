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
import { useRouter } from "next/navigation";
import { SearchBox } from "@/components/search-box";
import {
  ColumnPicker,
  HealthToggle,
  IconCheck,
  IconInfo,
  IconWarn,
  JsonValidationModal,
  PAGE_SIZE_OPTIONS,
  SearchableSelect,
  TablePagination,
  useHealthToggle,
  type PageSize,
} from "@/components/data-table";
import {
  updateLeadCell,
  type EditableLeadKey,
  type VendedorOption,
} from "./actions";
import { LeadEditModal } from "./lead-edit-modal";
import { buildLeadValidation, pendenciasFor, type LeadRow } from "./saude-lead";

type ColKey =
  | "tenant"
  | "nome"
  | "telefone"
  | "etapaNome"
  | "statusNome"
  | "vendedorNome"
  | "stepFollowup"
  | "statusFollowup"
  | "proximoFollowup"
  | "createdAt"
  | "agendamentoId"
  | "sessionId"
  | "saude"
  | "validacao";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  superOnly?: boolean;
  readOnly?: boolean;
  /** Edit kind aplicável a coluna inline. */
  editKind?: "text" | "numeric" | "datetime" | "vendedor";
};

const COLUMNS: ColDef[] = [
  { key: "tenant", label: "Cliente", superOnly: true, readOnly: true },
  { key: "nome", label: "Nome", readOnly: true },
  { key: "telefone", label: "Telefone", readOnly: true },
  { key: "etapaNome", label: "Etapa", readOnly: true },
  { key: "statusNome", label: "Status", readOnly: true },
  { key: "vendedorNome", label: "Vendedor", editKind: "vendedor" },
  {
    key: "stepFollowup",
    label: "Tentativas",
    align: "center",
    editKind: "numeric",
  },
  { key: "statusFollowup", label: "Status follow", editKind: "text" },
  {
    key: "proximoFollowup",
    label: "Próximo follow",
    editKind: "datetime",
  },
  { key: "createdAt", label: "Recebido em", readOnly: true },
  { key: "agendamentoId", label: "Agendamento", readOnly: true, align: "center" },
  { key: "sessionId", label: "Sessão", readOnly: true },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  {
    key: "validacao",
    label: "Validação JSON",
    align: "center",
    readOnly: true,
    superOnly: true,
  },
];

const STORAGE_HIDDEN = "groner.leads.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.leads.page_size_v1";
const ACTION_COL_KEYS: ColKey[] = ["validacao"];

const DEFAULT_VISIBLE: ReadonlySet<ColKey> = new Set([
  "nome",
  "telefone",
  "etapaNome",
  "statusNome",
  "vendedorNome",
  "stepFollowup",
  "statusFollowup",
  "proximoFollowup",
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

function valueFor(r: LeadRow, key: ColKey): unknown {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "";
  if (key === "saude") return pendenciasFor(r).length;
  if (key === "validacao") return 0;
  if (key === "vendedorNome") return r.vendedorNome ?? "";
  if (key === "createdAt") return r.createdAt ?? null;
  if (key === "proximoFollowup") return r.proximoFollowup ?? null;
  if (key === "agendamentoId") return r.agendamentoId ?? "";
  return (r as unknown as Record<string, unknown>)[key];
}

function displayFor(r: LeadRow, key: ColKey): string {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "—";
  if (key === "createdAt")
    return r.createdAt ? dtDateOnly.format(new Date(r.createdAt)) : "—";
  if (key === "proximoFollowup")
    return r.proximoFollowup ? dt.format(new Date(r.proximoFollowup)) : "—";
  if (key === "vendedorNome") return r.vendedorNome ?? "(IA)";
  if (key === "agendamentoId")
    return r.agendamentoId !== null ? `#${r.agendamentoId}` : "—";
  return fmtVal(valueFor(r, key));
}

function isCellMissing(r: LeadRow, key: ColKey): boolean {
  if (
    key === "tenant" ||
    key === "saude" ||
    key === "validacao" ||
    key === "vendedorNome" ||
    key === "agendamentoId" ||
    key === "createdAt"
  )
    return false;
  if (key === "telefone" || key === "etapaNome") {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  }
  // Outros campos: marcamos faltante quando vazio mas não como "saúde".
  const v = (r as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
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

export function LeadsTable({
  rows,
  isSuper,
  canEdit,
  isVendedor,
  vendedoresPorCliente,
  readOnlyReason = null,
  embedded = false,
}: {
  rows: LeadRow[];
  isSuper: boolean;
  canEdit: boolean;
  isVendedor: boolean;
  /** Map clienteId → lista de vendedores ativos pra picker. */
  vendedoresPorCliente: Record<number, VendedorOption[]>;
  /** Quando set, renderiza banner explicativo. Cobre drilldowns embedded. */
  readOnlyReason?: "cliente-admin" | null;
  /** Renderiza dentro do drilldown — esconde toolbar redundante. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("leads");
  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter((c) => !c.superOnly || isSuper).filter((c) =>
        showHealth ? true : c.key !== "saude" && c.key !== "validacao",
      ),
    [isSuper, showHealth],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);

  // hidden persiste em localStorage. Default: oculta tudo que não é DEFAULT_VISIBLE.
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
  const allActionsHidden = ACTION_COL_KEYS.every((k) => hidden.has(k));
  function toggleActionCols() {
    const nextHidden = new Set(hidden);
    if (allActionsHidden) {
      ACTION_COL_KEYS.forEach((k) => nextHidden.delete(k));
    } else {
      ACTION_COL_KEYS.forEach((k) => nextHidden.add(k));
    }
    persistHidden(nextHidden);
  }

  // Sort default: createdAt desc (lead mais novo primeiro).
  const [sortKey, setSortKey] = useState<ColKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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

  // Filtro super-only por nome.
  const [filtro, setFiltro] = useState("");
  const filteredRows = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) =>
      String(r.nome ?? "").toLowerCase().includes(q),
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
        rows: LeadRow[];
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
    leadId: number;
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
  function startEdit(leadId: number, key: ColKey) {
    setSaveErr(null);
    setEditing({ leadId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | number | boolean | null) {
    if (!editing) return;
    const { leadId, key } = editing;
    startTransition(async () => {
      const editKey = mapColToEditKey(key);
      if (!editKey) {
        setSaveErr("Campo não editável.");
        return;
      }
      const res = await updateLeadCell(leadId, editKey, value);
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setSaveErr(null);
      setEditing(null);
      router.refresh();
    });
  }

  function commitVendedor(leadId: number, vendedorId: number | null) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateLeadCell(leadId, "vendedorId", vendedorId);
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  const [editTarget, setEditTarget] = useState<LeadRow | null>(null);
  const [validacaoTarget, setValidacaoTarget] = useState<LeadRow | null>(null);

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
          if (isVendedor && def.key === "vendedorNome") return;
          e.preventDefault();
          startEdit(row.id, def.key);
        }
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, moveSelection, selected, pagedRows, orderedDefs, canEdit, isVendedor]);

  function renderRow(r: LeadRow, rIdx: number, opts?: { grouped?: boolean }) {
    const inGroup = opts?.grouped === true;
    const vendedorOptions =
      r.clienteId !== null
        ? vendedoresPorCliente[r.clienteId] ?? []
        : [];

    return (
      <tr
        key={r.id}
        onDoubleClick={() => setEditTarget(r)}
        style={{ cursor: "default" }}
      >
        {orderedDefs.map((d, ci) => {
          const isEditing =
            editing?.leadId === r.id && editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === ci;
          const isVendedorCell = d.key === "vendedorNome";
          // Vendedor (kind=usuario) só edita follow-ups, e nunca o vendedorNome.
          const editable =
            canEdit &&
            !d.readOnly &&
            (!isVendedor || (d.key !== "vendedorNome"));

          const tdClass =
            (d.align === "center" ? "text-center" : "") +
            (d.key === "nome" ? " font-medium" : "");

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
                  lead={r}
                  onOpen={() => setEditTarget(r)}
                />
              ) : d.key === "validacao" ? (
                <ValidationBadgeLead
                  lead={r}
                  onOpen={() => setValidacaoTarget(r)}
                />
              ) : isEditing && isVendedorCell ? (
                <VendedorCellEditor
                  current={r.vendedorId}
                  options={vendedorOptions}
                  pending={pending}
                  onCancel={cancelEdit}
                  onCommit={(id) => commitVendedor(r.id, id)}
                />
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  lead={r}
                  pending={pending}
                  onCancel={cancelEdit}
                  onCommit={commitEdit}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 group/cell">
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

  // Lista de vendedores do tenant pra modal — reusa primeira lista
  // disponível ou a do row do target, atualizada lá dentro.
  const vendedoresParaModal: VendedorOption[] = useMemo(() => {
    if (!editTarget || editTarget.clienteId === null) return [];
    return vendedoresPorCliente[editTarget.clienteId] ?? [];
  }, [editTarget, vendedoresPorCliente]);

  // Se ainda não carregou storage, esperamos pra evitar flash de colunas erradas.
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
          Leads são gerenciados pelo CRM. A edição inline está desabilitada
          pra clientes pra evitar conflitos com automações de follow-up. Para
          alterar atribuição, status ou próximo follow-up, use o CRM.
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
            placeholder="Buscar por nome, telefone, etapa, status..."
          />
          {isSuper && (
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nome..."
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
                  : "Agrupar leads por cliente"
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
          {isSuper && (
            <button
              type="button"
              onClick={toggleActionCols}
              className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-2"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
                height: "26px",
              }}
            >
              <span>Ações</span>
              <span
                aria-hidden
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 22,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: allActionsHidden
                    ? "rgba(255,255,255,0.10)"
                    : "var(--mint-700)",
                  border: `1px solid ${
                    allActionsHidden
                      ? "rgba(255,255,255,0.18)"
                      : "var(--mint-600)"
                  }`,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    left: allActionsHidden ? 1 : 11,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: allActionsHidden
                      ? "rgba(255,255,255,0.65)"
                      : "var(--mint-100)",
                    transition: "left 160ms ease",
                  }}
                />
              </span>
            </button>
          )}
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
                  Nenhum lead.
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
                          · {g.rows.length} lead
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
          {filteredRows.length} lead{filteredRows.length === 1 ? "" : "s"}
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

      <LeadEditModal
        open={editTarget !== null}
        target={editTarget}
        isSuper={isSuper}
        canEdit={canEdit}
        vendedores={vendedoresParaModal}
        onClose={() => setEditTarget(null)}
      />
      <JsonValidationModal
        open={validacaoTarget !== null}
        title={`Lead: ${validacaoTarget?.nome ?? `#${validacaoTarget?.id ?? ""}`}`}
        subtitle={
          validacaoTarget
            ? `${validacaoTarget.clienteNome ?? "—"} · id ${validacaoTarget.id}`
            : undefined
        }
        fields={
          validacaoTarget ? buildLeadValidation(validacaoTarget) : []
        }
        onClose={() => setValidacaoTarget(null)}
      />
    </div>
  );
}

function mapColToEditKey(k: ColKey): EditableLeadKey | null {
  if (k === "stepFollowup") return "stepFollowup";
  if (k === "statusFollowup") return "statusFollowup";
  if (k === "proximoFollowup") return "proximoFollowup";
  if (k === "vendedorNome") return "vendedorId";
  return null;
}

function HealthBadge({
  lead,
  onOpen,
}: {
  lead: LeadRow;
  onOpen: () => void;
}) {
  const pendentes = pendenciasFor(lead);
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
          ? "Lead saudável"
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

function ValidationBadgeLead({
  lead,
  onOpen,
}: {
  lead: LeadRow;
  onOpen: () => void;
}) {
  const fields = buildLeadValidation(lead);
  const warns = fields.filter((f) => f.status === "warn").length;
  const ok = warns === 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
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

function VendedorCellEditor({
  current,
  options,
  pending,
  onCancel,
  onCommit,
}: {
  current: number | null;
  options: VendedorOption[];
  pending: boolean;
  onCancel: () => void;
  onCommit: (id: number | null) => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ position: "relative", zIndex: 10, minWidth: 240 }}
    >
      <div style={{ minWidth: 240 }}>
        <SearchableSelect
          items={[
            {
              id: 0,
              uid: "__none__",
              nome: "(IA — sem vendedor)",
              role: "vendedor" as const,
              is_active: true,
            },
            ...options,
          ]}
          value={current ?? 0}
          onChange={(k) => {
            const id = k === 0 ? null : (k as number);
            onCommit(id);
          }}
          getKey={(o) => o.id}
          getLabel={(o) =>
            `${o.nome}${o.role === "owner" ? " (admin)" : ""}${
              o.id !== 0 && !o.is_active ? " · inativo" : ""
            }`
          }
          placeholder="Selecionar…"
          searchPlaceholder="Buscar vendedor…"
          width={300}
          disabled={pending}
        />
      </div>
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

function CellEditor({
  def,
  lead,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  lead: LeadRow;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | number | boolean | null) => void;
}) {
  const initial = (() => {
    if (def.key === "proximoFollowup") {
      const v = lead.proximoFollowup;
      if (!v) return "";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate(),
      )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const v = (lead as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isNumeric = def.editKind === "numeric";
  const isDatetime = def.editKind === "datetime";

  useEffect(() => {
    if (isNumeric || isDatetime) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [isNumeric, isDatetime]);

  useEffect(() => {
    if (isNumeric || isDatetime) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, isNumeric, isDatetime]);

  function commit() {
    if (isNumeric) {
      if (text.trim() === "") {
        onCommit(null);
        return;
      }
      const n = Number(text.replace(",", "."));
      if (!Number.isFinite(n)) return;
      onCommit(n);
    } else if (isDatetime) {
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
      {isNumeric ? (
        <input
          ref={inputRef}
          type="number"
          step="any"
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
          className="text-[12.5px] px-1.5 py-0.5 rounded min-w-0"
          style={{
            width: dynamicWidth,
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--mint-300)",
            color: "var(--fg)",
            outline: "none",
            textAlign: def.align === "center" ? "center" : undefined,
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}
        />
      ) : isDatetime ? (
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
