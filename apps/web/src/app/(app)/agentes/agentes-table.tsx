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
  BooleanToggle,
  ColumnPicker,
  IconCheck,
  IconInfo,
  IconWarn,
  JsonValidationModal,
  PAGE_SIZE_OPTIONS,
  TablePagination,
  type PageSize,
} from "@/components/data-table";
import {
  updateAgenteCell,
  type EditableAgenteKey,
} from "./actions";
import { AgenteEditModal } from "./agente-edit-modal";
import { AgenteNovoModal } from "./agente-novo-modal";
import { AgentePromptModal } from "./agente-prompt-modal";
import {
  buildAgenteValidation,
  pendenciasFor,
  type AgenteRow,
} from "./saude-agente";

export type AgenteRowFull = AgenteRow & {
  clienteNome: string | null;
  clienteTenant: string | null;
};

type ColKey =
  | "tenant"
  | "name"
  | "description"
  | "prompt"
  | "debounceTime"
  | "maxFollowups"
  | "humanIntervention"
  | "isActive"
  | "idN8n"
  | "voiceGender"
  | "saude"
  | "validacao";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  superOnly?: boolean;
  readOnly?: boolean;
  editKind?: "text" | "boolean" | "numeric";
};

const COLUMNS: ColDef[] = [
  { key: "tenant", label: "Cliente", superOnly: true, readOnly: true },
  { key: "name", label: "Nome", editKind: "text" },
  { key: "description", label: "Descrição", editKind: "text" },
  { key: "prompt", label: "Prompt", editKind: "text" },
  { key: "debounceTime", label: "Debounce (s)", align: "center", editKind: "numeric" },
  { key: "maxFollowups", label: "Max follow-ups", align: "center", editKind: "numeric" },
  { key: "humanIntervention", label: "Interv. humana", align: "center", editKind: "boolean" },
  { key: "isActive", label: "Ativo", align: "center", editKind: "boolean" },
  { key: "idN8n", label: "ID n8n", editKind: "text" },
  { key: "voiceGender", label: "Voz", align: "center", editKind: "text" },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  { key: "validacao", label: "Validação JSON", align: "center", readOnly: true, superOnly: true },
];

const STORAGE_HIDDEN = "groner.agentes.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.agentes.page_size_v1";
const ACTION_COL_KEYS: ColKey[] = ["validacao"];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s.length === 0 ? "—" : s;
}

function valueFor(r: AgenteRowFull, key: ColKey): unknown {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "";
  if (key === "saude") return pendenciasFor(r).length;
  if (key === "validacao") return 0;
  return (r as unknown as Record<string, unknown>)[key];
}

function isCellMissing(r: AgenteRowFull, key: ColKey): boolean {
  if (
    key === "tenant" ||
    key === "saude" ||
    key === "validacao" ||
    key === "humanIntervention" ||
    key === "isActive"
  )
    return false;
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
  if (typeof av === "boolean" && typeof bv === "boolean") {
    return av === bv ? 0 : av ? -1 : 1;
  }
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
}

export function AgentesTable({
  rows,
  isSuper,
  canEdit,
  clientes,
  embedded = false,
}: {
  rows: AgenteRowFull[];
  isSuper: boolean;
  canEdit: boolean;
  clientes: { id: number; nome: string }[];
  /** Renderiza dentro do drilldown — esconde toolbar redundante. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter(
        (c) =>
          (!c.superOnly || isSuper) && (!embedded || c.key !== "tenant"),
      ),
    [isSuper, embedded],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);

  const [hidden, setHidden] = useState<Set<ColKey>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HIDDEN);
      if (!raw) return;
      const stored = JSON.parse(raw) as ColKey[];
      if (!Array.isArray(stored)) return;
      setHidden(new Set(stored.filter((k) => visibleKeys.includes(k))));
    } catch {
      /* default vazio */
    }
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
    if (allActionsHidden) {
      const nextHidden = new Set(hidden);
      ACTION_COL_KEYS.forEach((k) => nextHidden.delete(k));
      persistHidden(nextHidden);
    } else {
      const nextHidden = new Set(hidden);
      ACTION_COL_KEYS.forEach((k) => nextHidden.add(k));
      persistHidden(nextHidden);
    }
  }

  const [sortKey, setSortKey] = useState<ColKey>("name");
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

  // Filtro super-only por nome do agente.
  const [filtro, setFiltro] = useState("");
  const filteredRows = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) =>
      String(r.name ?? "").toLowerCase().includes(q),
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
        rows: AgenteRowFull[];
      }
    >();
    for (const r of filteredRows) {
      if (!map.has(r.clienteId)) {
        map.set(r.clienteId, {
          clienteId: r.clienteId,
          clienteNome: r.clienteNome,
          clienteTenant: r.clienteTenant,
          rows: [],
        });
      }
      map.get(r.clienteId)!.rows.push(r);
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
    agenteId: number;
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
  function startEdit(agenteId: number, key: ColKey) {
    setSaveErr(null);
    setEditing({ agenteId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | number | boolean | null) {
    if (!editing) return;
    const { agenteId, key } = editing;
    startTransition(async () => {
      const res = await updateAgenteCell(
        agenteId,
        key as EditableAgenteKey,
        value,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setSaveErr(null);
      setEditing(null);
      router.refresh();
    });
  }
  function toggleBoolean(
    agenteId: number,
    key: "humanIntervention" | "isActive",
    current: boolean,
  ) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateAgenteCell(
        agenteId,
        key as EditableAgenteKey,
        !current,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  const [novoOpen, setNovoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AgenteRowFull | null>(null);
  const [validacaoTarget, setValidacaoTarget] = useState<AgenteRowFull | null>(null);
  const [promptTarget, setPromptTarget] = useState<AgenteRowFull | null>(null);

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

  function renderRow(r: AgenteRowFull, rIdx: number) {
    return (
      <tr
        key={r.id}
        onDoubleClick={() => setEditTarget(r)}
        style={{ cursor: "default" }}
      >
        {orderedDefs.map((d, cIdx) => {
          const isEditing =
            editing?.agenteId === r.id && editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === cIdx;
          const editable = canEdit && !d.readOnly;
          const isBoolToggle =
            d.editKind === "boolean" && editable && !isEditing;
          const tdClass =
            (d.align === "center" ? "text-center" : "") +
            (d.key === "name" ? " font-medium" : "");
          return (
            <td
              key={d.key}
              className={tdClass.trim() || undefined}
              onClick={() => setSelected({ r: rIdx, c: cIdx })}
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
              }}
            >
              {d.key === "saude" ? (
                <HealthBadge
                  agente={r}
                  onOpen={() => setEditTarget(r)}
                />
              ) : d.key === "validacao" ? (
                <ValidationBadgeAg
                  agente={r}
                  onOpen={() => setValidacaoTarget(r)}
                />
              ) : isBoolToggle ? (
                <BooleanToggle
                  value={
                    !!(r as unknown as Record<string, boolean>)[d.key]
                  }
                  pending={pending}
                  offIsAlert={d.key === "isActive"}
                  ariaLabel={d.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBoolean(
                      r.id,
                      d.key as "humanIntervention" | "isActive",
                      !!(r as unknown as Record<string, boolean>)[d.key],
                    );
                  }}
                />
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  agente={r}
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
                    }}
                    title={String(valueFor(r, d.key) ?? "")}
                  >
                    {fmtVal(valueFor(r, d.key))}
                  </span>
                  {isCellMissing(r, d.key) && (
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
                  {d.key === "prompt" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPromptTarget(r);
                      }}
                      title="Abrir prompt em modal grande"
                      className="chip chip-mint text-[10.5px] px-1.5 py-0.5 transition-colors whitespace-nowrap"
                    >
                      Abrir
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
        <div className="flex items-center gap-2 flex-wrap">
          <SearchBox compact placeholder="Buscar por nome, descrição..." />
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
          {isSuper && !embedded && (
            <button
              type="button"
              onClick={() => {
                if (!groupByCliente) {
                  setCollapsed(new Set(filteredRows.map((r) => r.clienteId)));
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
            >
              <span aria-hidden className="text-[10px]">⊟</span>
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
          {canEdit && (
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="chip chip-mint text-[12px] px-2.5 py-1"
              style={{ height: "26px" }}
            >
              <span aria-hidden className="text-[11px]">＋</span>
              <span>Novo agente</span>
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
                  Nenhum agente.
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
                        }}
                      >
                        <span style={{ color: "var(--mint-300)", marginRight: 6 }}>
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {g.clienteNome ?? g.clienteTenant ?? `Cliente #${g.clienteId}`}
                        <span
                          className="numerics ml-2"
                          style={{ color: "var(--fg-subtle)", fontSize: "11px" }}
                        >
                          · {g.rows.length} agente
                          {g.rows.length === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed && g.rows.map((r, i) => renderRow(r, i))}
                  </Fragment>
                );
              })}
            {!grouped && pagedRows.map((r, i) => renderRow(r, i))}
          </tbody>
        </table>
      </div>

      <div
        className="px-4 py-2 text-[10.5px] flex items-center gap-3 flex-wrap"
        style={{ color: "var(--fg-subtle)", borderTop: "1px solid var(--b-soft)" }}
      >
        <span>
          {filteredRows.length} agente{filteredRows.length === 1 ? "" : "s"}
        </span>
        {pending && <span>· salvando…</span>}
      </div>

      <div className="px-4 py-2" style={{ borderTop: "1px solid var(--b-soft)" }}>
        <TablePagination
          total={filteredRows.length}
          pageSize={pageSize}
          pageIndex={pageIndex}
          onPageSizeChange={persistPageSize}
          onPageIndexChange={setPageIndex}
        />
      </div>

      {canEdit && (
        <AgenteNovoModal
          open={novoOpen}
          isSuper={isSuper}
          clientes={clientes}
          onClose={() => setNovoOpen(false)}
        />
      )}
      <AgenteEditModal
        open={editTarget !== null}
        target={editTarget}
        isSuper={isSuper}
        canEdit={canEdit}
        onClose={() => setEditTarget(null)}
      />
      <JsonValidationModal
        open={validacaoTarget !== null}
        title={`Agente: ${validacaoTarget?.name ?? "(sem nome)"}`}
        subtitle={
          validacaoTarget
            ? `${validacaoTarget.clienteNome ?? "—"} · id ${validacaoTarget.id}`
            : undefined
        }
        fields={
          validacaoTarget ? buildAgenteValidation(validacaoTarget) : []
        }
        onClose={() => setValidacaoTarget(null)}
      />
      <AgentePromptModal
        open={promptTarget !== null}
        target={promptTarget}
        canEdit={canEdit}
        onClose={() => setPromptTarget(null)}
      />
    </div>
  );
}

function HealthBadge({
  agente,
  onOpen,
}: {
  agente: AgenteRow;
  onOpen: () => void;
}) {
  const pendentes = pendenciasFor(agente);
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
          ? "Cadastro completo"
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
        style={{ backgroundColor: ok ? "var(--mint-300)" : "var(--rose-300)" }}
      />
      <span className="text-[11px]">
        {ok
          ? "completo"
          : `${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"}`}
      </span>
    </button>
  );
}

function ValidationBadgeAg({
  agente,
  onOpen,
}: {
  agente: AgenteRow;
  onOpen: () => void;
}) {
  const fields = buildAgenteValidation(agente);
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

function CellEditor({
  def,
  agente,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  agente: AgenteRow;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | number | boolean | null) => void;
}) {
  const initial = (() => {
    const v = (agente as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isNumeric = def.editKind === "numeric";

  useEffect(() => {
    if (isNumeric) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [isNumeric]);

  useEffect(() => {
    if (isNumeric) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, isNumeric]);

  function commit() {
    if (isNumeric) {
      const n = text.trim() === "" ? 0 : Number(text.replace(",", "."));
      if (!Number.isFinite(n)) return;
      onCommit(n);
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
      ) : (
        <textarea
          ref={taRef}
          rows={def.key === "prompt" ? 8 : 1}
          spellCheck={def.key === "prompt" ? false : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const INDENT = "  ";
              if (e.shiftKey) {
                // Dedenta linha(s) — remove até 2 espaços do começo de cada linha selecionada.
                const before = text.slice(0, start);
                const lineStart = before.lastIndexOf("\n") + 1;
                const selection = text.slice(lineStart, end);
                const dedented = selection.replace(/^ {1,2}/gm, "");
                const removed = selection.length - dedented.length;
                const next =
                  text.slice(0, lineStart) + dedented + text.slice(end);
                setText(next);
                requestAnimationFrame(() => {
                  if (taRef.current) {
                    taRef.current.selectionStart = Math.max(
                      lineStart,
                      start - Math.min(2, removed),
                    );
                    taRef.current.selectionEnd = end - removed;
                  }
                });
              } else if (start === end) {
                // Cursor único — insere indent na posição.
                const next = text.slice(0, start) + INDENT + text.slice(end);
                setText(next);
                requestAnimationFrame(() => {
                  if (taRef.current) {
                    taRef.current.selectionStart =
                      taRef.current.selectionEnd = start + INDENT.length;
                  }
                });
              } else {
                // Seleção múltipla — indenta cada linha selecionada.
                const before = text.slice(0, start);
                const lineStart = before.lastIndexOf("\n") + 1;
                const selection = text.slice(lineStart, end);
                const indented = selection.replace(/^/gm, INDENT);
                const added = indented.length - selection.length;
                const next =
                  text.slice(0, lineStart) + indented + text.slice(end);
                setText(next);
                requestAnimationFrame(() => {
                  if (taRef.current) {
                    taRef.current.selectionStart = start + INDENT.length;
                    taRef.current.selectionEnd = end + added;
                  }
                });
              }
            } else if (e.key === "Enter" && !e.shiftKey) {
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
            width: def.key === "prompt" ? "min(80ch, 90vw)" : dynamicWidth,
            maxWidth: "min(80ch, 90vw)",
            minHeight: def.key === "prompt" ? "240px" : "26px",
            resize: def.key === "prompt" ? "vertical" : "none",
            overflow: def.key === "prompt" ? "auto" : "hidden",
            lineHeight: def.key === "prompt" ? "1.6" : "1.4",
            fontFamily:
              def.key === "prompt"
                ? "var(--font-geist-mono), ui-monospace, monospace"
                : "inherit",
            tabSize: def.key === "prompt" ? 2 : undefined,
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
