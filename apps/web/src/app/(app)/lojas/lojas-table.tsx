"use client";

// [TABELAS.md] drag-reorder de colunas existe aqui mas NÃO faz parte do
// padrão canônico atualizado. Manter por enquanto. Avaliar remoção em
// refator futuro (col_order_v1 marcada como DEPRECATED em docs/TABELAS.md).

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
import type { Loja } from "@/lib/db/schema";
import { SearchBox } from "@/components/search-box";
import {
  AcessarButton,
  ColumnPicker,
  CopyButton,
  HealthToggle,
  IconCheck,
  IconInfo,
  IconWarn,
  JsonValidationModal,
  PAGE_SIZE_OPTIONS,
  TablePagination,
  useHealthToggle,
  type PageSize,
} from "@/components/data-table";
import {
  applyCanonicalShape,
  updateLojaCell,
  type EditableLojaKey,
} from "./actions";
import { LojaEditModal } from "./loja-edit-modal";
import { LojaNovoModal } from "./loja-novo-modal";
import { LojaCrmFetchModal } from "./loja-crm-fetch-modal";
import { LojaBuscarUsuariosModal } from "./loja-buscar-usuarios-modal";
import { buildLojaValidation, totalIssues } from "./saude-loja";

export type LojaRow = {
  clienteId: number;
  clienteNome: string | null;
  clienteTenant: string | null;
  loja: Loja;
};

type ColKey =
  | "tenant"
  | "nome"
  | "crm_id"
  | "cnpj"
  | "telefone"
  | "endereco"
  | "endereco_cep"
  | "endereco_rua"
  | "endereco_numero"
  | "endereco_bairro"
  | "endereco_cidade"
  | "endereco_estado"
  | "endereco_complemento"
  | "area_atuacao"
  | "consumo_minimo"
  | "agenda_qtd_slotes"
  | "agenda_qtd_turnos"
  | "agenda_dias_frente"
  | "agenda_tempo_slots"
  | "agenda_max_dias_fente"
  | "agenda_tempo_antecessor"
  | "agenda_tempo_antecedencia"
  | "saude"
  | "validacao"
  | "crm_fetch"
  | "usuarios_fetch"
  // Drilldown only — sempre fim, não reordenável, não no ColumnPicker.
  | "acoes";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  /** Visível só pra super (ex: tenant, que é meta cross-tenant). */
  superOnly?: boolean;
  /** Não editável (ex: tenant, saude). */
  readOnly?: boolean;
  /** Tipo do editor inline: text, numeric (number input). */
  editKind?: "text" | "numeric";
  /** Quando `false`, header não responde a click pra ordenar. */
  sortable?: boolean;
};

const COLUMNS: ColDef[] = [
  { key: "tenant", label: "Cliente", superOnly: true, readOnly: true },
  { key: "nome", label: "Nome", editKind: "text" },
  { key: "crm_id", label: "CRM ID", editKind: "text" },
  { key: "cnpj", label: "CNPJ", editKind: "text" },
  { key: "telefone", label: "Telefone", editKind: "text" },
  { key: "endereco", label: "Endereço (legado)", editKind: "text" },
  { key: "endereco_cep", label: "CEP", editKind: "text" },
  { key: "endereco_rua", label: "Rua", editKind: "text" },
  { key: "endereco_numero", label: "Nº", align: "center", editKind: "text" },
  { key: "endereco_bairro", label: "Bairro", editKind: "text" },
  { key: "endereco_cidade", label: "Cidade", editKind: "text" },
  { key: "endereco_estado", label: "Estado", align: "center", editKind: "text" },
  { key: "endereco_complemento", label: "Complemento", editKind: "text" },
  { key: "area_atuacao", label: "Área (km)", align: "center", editKind: "numeric" },
  { key: "consumo_minimo", label: "Consumo mín.", align: "center", editKind: "numeric" },
  { key: "agenda_qtd_slotes", label: "Slots", align: "center", editKind: "text" },
  { key: "agenda_qtd_turnos", label: "Turnos", align: "center", editKind: "text" },
  { key: "agenda_dias_frente", label: "Dias frente", align: "center", editKind: "text" },
  { key: "agenda_tempo_slots", label: "Tempo slot", align: "center", editKind: "text" },
  { key: "agenda_max_dias_fente", label: "Max dias", align: "center", editKind: "text" },
  { key: "agenda_tempo_antecessor", label: "Antecessor", align: "center", editKind: "text" },
  { key: "agenda_tempo_antecedencia", label: "Antecedência", align: "center", editKind: "text" },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  { key: "validacao", label: "Validação JSON", align: "center", readOnly: true, superOnly: true },
  { key: "crm_fetch", label: "Buscar do CRM", align: "center", readOnly: true, superOnly: true },
  { key: "usuarios_fetch", label: "Buscar usuários", align: "center", readOnly: true, superOnly: true },
  // Drilldown — sempre última coluna, fixa à direita, não no picker.
  { key: "acoes", label: "Ações", align: "right", readOnly: true, sortable: false },
];

const STORAGE_ORDER = "groner.lojas.col_order_v1";
const STORAGE_HIDDEN = "groner.lojas.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.lojas.page_size_v1";

// Colunas de "ação" (botões) que o filtro de minimalismo esconde.
// Saúde NÃO entra — sempre visível por requisito.
const ACTION_COL_KEYS: ColKey[] = ["validacao", "crm_fetch", "usuarios_fetch"];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s.length === 0 ? "—" : s;
}

function cmp(av: unknown, bv: unknown): number {
  const aIsNull = av === null || av === undefined || av === "";
  const bIsNull = bv === null || bv === undefined || bv === "";
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
}

function valueFor(r: LojaRow, key: ColKey): unknown {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "";
  if (key === "saude") return totalIssues(r.loja).total;
  if (key === "acoes") return 0;
  return (r.loja as unknown as Record<string, unknown>)[key];
}

function isCellMissing(r: LojaRow, key: ColKey): boolean {
  if (key === "saude" || key === "tenant" || key === "acoes") return false;
  const v = (r.loja as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

export function LojasTable({
  rows,
  isSuper,
  canEdit,
  embedded = false,
  embeddedClienteId,
  embeddedClienteNome,
}: {
  rows: LojaRow[];
  isSuper: boolean;
  canEdit: boolean;
  /** Renderiza dentro do drilldown — esconde toolbar redundante. */
  embedded?: boolean;
  /** Quando embedded, força o clienteId no modal Nova loja — sem
   *  depender de rows (que pode estar vazio se cliente ainda não tem
   *  lojas). */
  embeddedClienteId?: number;
  embeddedClienteNome?: string;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("lojas");

  // Colunas visíveis (filtra superOnly; remove `acoes` quando embedded;
  // esconde colunas de saúde quando toggle OFF).
  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter(
        (c) =>
          (!c.superOnly || isSuper) &&
          (!embedded || c.key !== "acoes") &&
          (showHealth ||
            (c.key !== "saude" &&
              c.key !== "validacao")),
      ),
    [isSuper, embedded, showHealth],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);
  // ColumnPicker: `acoes` nunca aparece — não é ocultável.
  const pickerDefs = useMemo(
    () => visibleDefs.filter((d) => d.key !== "acoes"),
    [visibleDefs],
  );

  // Ordem das colunas — persistida em localStorage.
  const [order, setOrder] = useState<ColKey[]>(visibleKeys);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ORDER);
      if (!raw) return;
      const stored = JSON.parse(raw) as ColKey[];
      if (!Array.isArray(stored)) return;
      const valid = stored.filter((k) => visibleKeys.includes(k));
      const missing = visibleKeys.filter((k) => !valid.includes(k));
      setOrder([...valid, ...missing]);
    } catch {
      /* default */
    }
  }, [visibleKeys]);

  function persistOrder(next: ColKey[]) {
    setOrder(next);
    try {
      localStorage.setItem(STORAGE_ORDER, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Visibilidade (esconde/mostra colunas).
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

  // Toggle de esconder/mostrar colunas de ação. Quando mostra, força
  // que apareçam nas primeiras posições da ordem.
  const allActionsHidden = ACTION_COL_KEYS.every((k) => hidden.has(k));
  function toggleActionCols() {
    if (allActionsHidden) {
      // Mostrar — remove do hidden + move pra início da order.
      const nextHidden = new Set(hidden);
      ACTION_COL_KEYS.forEach((k) => nextHidden.delete(k));
      persistHidden(nextHidden);
      const next = order.filter((k) => !ACTION_COL_KEYS.includes(k));
      next.unshift(...ACTION_COL_KEYS.filter((k) => visibleKeys.includes(k)));
      persistOrder(next);
    } else {
      // Esconder — adiciona action keys ao hidden.
      const nextHidden = new Set(hidden);
      ACTION_COL_KEYS.forEach((k) => nextHidden.add(k));
      persistHidden(nextHidden);
    }
  }

  // Sort.
  const [sortKey, setSortKey] = useState<ColKey>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(k: ColKey) {
    const def = COLUMNS.find((c) => c.key === k);
    if (def?.sortable === false) return;
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

  // Drag & drop dos headers.
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [overKey, setOverKey] = useState<ColKey | null>(null);

  function onDragStart(e: React.DragEvent, key: ColKey) {
    setDragKey(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  }
  function onDragOver(e: React.DragEvent, key: ColKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overKey !== key) setOverKey(key);
  }
  function onDragLeave(_: React.DragEvent, key: ColKey) {
    if (overKey === key) setOverKey(null);
  }
  function onDrop(e: React.DragEvent, target: ColKey) {
    e.preventDefault();
    const source = (dragKey ?? e.dataTransfer.getData("text/plain")) as ColKey;
    setDragKey(null);
    setOverKey(null);
    if (!source || source === target) return;
    // `acoes` é fixa no fim: bloqueia drag-reorder envolvendo ela.
    if (source === "acoes" || target === "acoes") return;
    const next = [...order];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source);
    persistOrder(next);
  }
  function onDragEnd() {
    setDragKey(null);
    setOverKey(null);
  }

  const orderedDefs = useMemo(() => {
    const map = new Map(visibleDefs.map((d) => [d.key, d]));
    const out: ColDef[] = [];
    for (const k of order) {
      const d = map.get(k);
      if (d) out.push(d);
    }
    for (const d of visibleDefs) if (!out.includes(d)) out.push(d);
    const filtered = out.filter((d) => !hidden.has(d.key));
    // `acoes` sempre por último — independente de drag/order persistido.
    const acoesIdx = filtered.findIndex((d) => d.key === "acoes");
    if (acoesIdx >= 0 && acoesIdx !== filtered.length - 1) {
      const [acoesDef] = filtered.splice(acoesIdx, 1);
      filtered.push(acoesDef);
    }
    return filtered;
  }, [order, visibleDefs, hidden]);

  // Edição inline.
  const [editing, setEditing] = useState<{
    clienteId: number;
    lojaId: string;
    key: ColKey;
  } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setEditing(null);
  }, [rows]);

  // Navegação por setas — state aqui, callbacks depois de pagedRows.
  const [selected, setSelected] = useState<
    { r: number; c: number } | null
  >(null);
  useEffect(() => {
    setSelected(null);
  }, [rows]);

  function startEdit(clienteId: number, lojaId: string, key: ColKey) {
    setSaveErr(null);
    setEditing({ clienteId, lojaId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | number | null) {
    if (!editing) return;
    const { clienteId, lojaId, key } = editing;
    startTransition(async () => {
      const res = await updateLojaCell(
        clienteId,
        lojaId,
        key as EditableLojaKey,
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

  // Modais.
  const [novoOpen, setNovoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LojaRow | null>(null);
  const [validacaoTarget, setValidacaoTarget] = useState<LojaRow | null>(null);
  const [crmFetchTarget, setCrmFetchTarget] = useState<LojaRow | null>(null);
  const [usuariosFetchTarget, setUsuariosFetchTarget] = useState<LojaRow | null>(null);
  const [pendingShape, startShapeTransition] = useTransition();

  function handleApplyShape() {
    if (!validacaoTarget) return;
    startShapeTransition(async () => {
      const res = await applyCanonicalShape(
        validacaoTarget.clienteId,
        validacaoTarget.loja.id,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setValidacaoTarget(null);
      router.refresh();
    });
  }

  // Agrupar por cliente (super-only — pra cliente comum só aparece o próprio).
  const [groupByCliente, setGroupByCliente] = useState(false);
  const [collapsedClientes, setCollapsedClientes] = useState<Set<number>>(
    new Set(),
  );
  function toggleCollapse(cid: number) {
    setCollapsedClientes((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  // Filtro super-only por nome de loja (substring case-insensitive).
  const [lojaFilter, setLojaFilter] = useState("");
  const filteredRows = useMemo(() => {
    const q = lojaFilter.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) =>
      String(r.loja.nome ?? "")
        .toLowerCase()
        .includes(q),
    );
  }, [sortedRows, lojaFilter]);

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
    () =>
      filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [filteredRows, pageIndex, pageSize],
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
          target.tagName === "A" ||
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
        // Coluna `acoes`: Enter navega pro drilldown.
        if (def?.key === "acoes" && row) {
          e.preventDefault();
          router.push(
            `/clientes/${row.clienteId}/lojas/${row.loja.id}/dados`,
          );
          return;
        }
        if (def && row && canEdit && !def.readOnly) {
          e.preventDefault();
          startEdit(row.clienteId, row.loja.id, def.key);
        }
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, moveSelection, selected, pagedRows, orderedDefs, canEdit, router]);

  // Agrupamento por cliente.
  const grouped = useMemo(() => {
    if (!groupByCliente) return null;
    const map = new Map<
      number,
      {
        clienteId: number;
        clienteNome: string | null;
        clienteTenant: string | null;
        rows: LojaRow[];
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

  function renderRow(r: LojaRow, rIdx: number) {
    const lojaId = r.loja.id;
    return (
      <tr
        key={`${r.clienteId}-${lojaId}`}
        onDoubleClick={() =>
          router.push(`/clientes/${r.clienteId}/lojas/${lojaId}/dados`)
        }
        style={{ cursor: "pointer" }}
      >
        {orderedDefs.map((d, cIdx) => {
          const isEditing =
            editing?.clienteId === r.clienteId &&
            editing?.lojaId === lojaId &&
            editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === cIdx;
          const editable =
            canEdit && !d.readOnly && (!d.superOnly || isSuper);
          const tdClass =
            (d.align === "center" ? "text-center" : "") +
            (d.key === "nome" ? " font-medium" : "");

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
              {d.key === "acoes" ? (
                <AcessarButton
                  href={`/clientes/${r.clienteId}/lojas/${r.loja.id}/dados`}
                  ariaLabel={`Acessar dados da loja ${r.loja.nome?.trim() || `#${r.loja.id.slice(0, 8)}`}`}
                />
              ) : d.key === "saude" ? (
                <HealthBadge
                  loja={r.loja}
                  onOpen={() =>
                    router.push(
                      `/clientes/${r.clienteId}/lojas/${r.loja.id}/dados`,
                    )
                  }
                />
              ) : d.key === "validacao" ? (
                <ValidationBadge
                  loja={r.loja}
                  onOpen={() => setValidacaoTarget(r)}
                />
              ) : d.key === "usuarios_fetch" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUsuariosFetchTarget(r);
                  }}
                  title="Buscar usuários desta loja no CRM e importar"
                  className="chip chip-mint text-[11px] px-2 py-0.5 transition-colors hover:brightness-110"
                  style={{ cursor: "pointer" }}
                >
                  ↓ Usuários
                </button>
              ) : d.key === "crm_fetch" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCrmFetchTarget(r);
                  }}
                  title={
                    r.loja.crm_id
                      ? `Buscar dados desta loja no CRM (crm_id: ${r.loja.crm_id})`
                      : "Configure crm_id antes de buscar"
                  }
                  className={
                    r.loja.crm_id
                      ? "chip chip-mint text-[11px] px-2 py-0.5 transition-colors hover:brightness-110"
                      : "text-[11px] px-2 py-0.5 rounded-md transition-colors"
                  }
                  style={{
                    backgroundColor: r.loja.crm_id
                      ? undefined
                      : "var(--ink-3)",
                    border: r.loja.crm_id
                      ? undefined
                      : "1px solid var(--b-soft)",
                    color: r.loja.crm_id
                      ? undefined
                      : "var(--fg-disabled)",
                    cursor: r.loja.crm_id ? "pointer" : "not-allowed",
                  }}
                  disabled={!r.loja.crm_id}
                >
                  ↓ Buscar
                </button>
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  loja={r.loja}
                  pending={pending}
                  onCancel={cancelEdit}
                  onCommit={commitEdit}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 group/cell">
                  {d.key === "telefone" && r.loja.telefone && (
                    <CopyButton value={r.loja.telefone} />
                  )}
                  <span
                    className="inline-block align-middle"
                    style={{
                      maxWidth: "25ch",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={
                      d.key === "tenant"
                        ? (r.clienteNome ?? r.clienteTenant ?? "")
                        : String(valueFor(r, d.key) ?? "")
                    }
                  >
                    {d.key === "tenant"
                      ? (r.clienteNome ?? r.clienteTenant ?? "—")
                      : fmtVal(valueFor(r, d.key))}
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
                        startEdit(r.clienteId, lojaId, d.key);
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
          <SearchBox
            compact
            placeholder="Buscar por nome, CRM, cidade..."
          />
          {isSuper && (
            <LojaFilter
              rows={sortedRows}
              value={lojaFilter}
              onChange={setLojaFilter}
            />
          )}
          {isSuper && (
            <button
              type="button"
              onClick={() => {
                if (!groupByCliente) {
                  // Ao ativar: colapsa todos os clientes por default.
                  const allCids = new Set(
                    filteredRows.map((r) => r.clienteId),
                  );
                  setCollapsedClientes(allCids);
                  setGroupByCliente(true);
                } else {
                  setGroupByCliente(false);
                  setCollapsedClientes(new Set());
                }
              }}
              className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition-colors"
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
                  : "Agrupar lojas por cliente"
              }
            >
              <span aria-hidden className="text-[10px]">⊟</span>
              <span>{groupByCliente ? "Desagrupar" : "Agrupar"}</span>
            </button>
          )}
          {isSuper && (
          <button
            type="button"
            onClick={toggleActionCols}
            className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-2 transition-colors"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
              height: "26px",
            }}
            title={
              allActionsHidden
                ? "Mostrar colunas de ação (validação, etc)"
                : "Esconder colunas de ação (validação, etc) — Saúde fica"
            }
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
                transition:
                  "background-color 160ms ease, border-color 160ms ease",
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
                  transition: "left 160ms ease, background-color 160ms ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.30)",
                }}
              />
            </span>
          </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            allDefs={pickerDefs}
            hidden={hidden}
            onToggle={toggleHidden}
            onShowAll={() => persistHidden(new Set())}
            onHideAll={() => persistHidden(new Set(visibleKeys.filter((k) => k !== "acoes")))}
          />
          <HealthToggle value={showHealth} onChange={setShowHealth} />
          {canEdit && (
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="chip chip-mint text-[12px] px-2.5 py-1 transition-colors whitespace-nowrap"
              style={{ height: "26px" }}
            >
              <span aria-hidden className="text-[11px]">＋</span>
              <span>Nova loja</span>
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
                const isOver = overKey === d.key;
                const isDragging = dragKey === d.key;
                if (d.key === "acoes") {
                  return (
                    <th
                      key={d.key}
                      className="text-right"
                      style={{ cursor: "default" }}
                    >
                      <span
                        className="inline-flex items-center select-none"
                        style={{
                          whiteSpace: "nowrap",
                          color: "var(--fg-muted)",
                        }}
                      >
                        {d.label}
                      </span>
                    </th>
                  );
                }
                return (
                  <th
                    key={d.key}
                    className={d.align === "center" ? "text-center" : undefined}
                    draggable
                    onDragStart={(e) => onDragStart(e, d.key)}
                    onDragOver={(e) => onDragOver(e, d.key)}
                    onDragLeave={(e) => onDragLeave(e, d.key)}
                    onDrop={(e) => onDrop(e, d.key)}
                    onDragEnd={onDragEnd}
                    style={{
                      cursor: "move",
                      backgroundColor: isOver
                        ? "rgba(255,255,255,0.025)"
                        : undefined,
                      opacity: isDragging ? 0.5 : 1,
                      borderLeft: isOver
                        ? "2px solid var(--mint-300)"
                        : undefined,
                    }}
                    title="Arraste pra reorganizar · click pra ordenar"
                  >
                    <span
                      className="inline-flex items-center gap-1 select-none"
                      style={{
                        maxWidth: "25ch",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <span
                        aria-hidden
                        className="text-[8px] text-[color:var(--fg-disabled)] cursor-grab"
                      >
                        ⋮⋮
                      </span>
                      <span
                        className="hover:text-[color:var(--mint-300)] transition-colors cursor-pointer"
                        title={d.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSort(d.key);
                        }}
                        style={{
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
                  {lojaFilter.trim()
                    ? `Nenhuma loja com "${lojaFilter.trim()}".`
                    : "Nenhuma loja."}
                </td>
              </tr>
            )}
            {grouped &&
              grouped.map((g) => {
                const isCollapsed = collapsedClientes.has(g.clienteId);
                const headerLabel =
                  g.clienteNome ??
                  g.clienteTenant ??
                  `Cliente #${g.clienteId}`;
                return (
                  <Fragment key={`g-${g.clienteId}`}>
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
                          letterSpacing: "0.02em",
                          borderTop: "1px solid var(--b-base)",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            display: "inline-block",
                            width: 12,
                            color: "var(--mint-300)",
                            marginRight: 6,
                          }}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        <span>{headerLabel}</span>
                        <span
                          className="numerics ml-2"
                          style={{
                            color: "var(--fg-subtle)",
                            fontSize: "11px",
                          }}
                        >
                          · {g.rows.length} loja
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
        style={{
          color: "var(--fg-subtle)",
          borderTop: "1px solid var(--b-soft)",
        }}
      >
        <span>
          {filteredRows.length} loja{filteredRows.length === 1 ? "" : "s"}
          {lojaFilter.trim()
            ? ` filtradas (de ${sortedRows.length})`
            : ""}
        </span>
        {pending && <span>· salvando…</span>}
        <span className="ml-auto opacity-70">
          Click no header pra ordenar · arraste pra reorganizar · double-click na linha pra editar tudo
        </span>
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

      <LojaCrmFetchModal
        open={crmFetchTarget !== null}
        target={crmFetchTarget}
        onClose={() => setCrmFetchTarget(null)}
      />
      <LojaBuscarUsuariosModal
        open={usuariosFetchTarget !== null}
        target={usuariosFetchTarget}
        onClose={() => setUsuariosFetchTarget(null)}
      />
      <JsonValidationModal
        open={validacaoTarget !== null}
        title={`Loja: ${validacaoTarget?.loja.nome || "(sem nome)"}`}
        subtitle={
          validacaoTarget
            ? `Cliente: ${validacaoTarget.clienteNome ?? "—"} · id: ${validacaoTarget.loja.id.slice(0, 12)}…`
            : undefined
        }
        fields={
          validacaoTarget ? buildLojaValidation(validacaoTarget.loja) : []
        }
        pending={pendingShape}
        onApply={canEdit ? handleApplyShape : undefined}
        onClose={() => setValidacaoTarget(null)}
      />

      {canEdit && (
        <LojaNovoModal
          open={novoOpen}
          rows={rows}
          isSuper={isSuper}
          forcedClienteId={embeddedClienteId}
          forcedClienteNome={embeddedClienteNome}
          onClose={() => setNovoOpen(false)}
        />
      )}
      <LojaEditModal
        open={editTarget !== null}
        target={editTarget}
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        onClose={() => setEditTarget(null)}
      />
    </div>
  );
}

function ValidationBadge({
  loja,
  onOpen,
}: {
  loja: import("@/lib/db/schema").Loja;
  onOpen: () => void;
}) {
  const fields = buildLojaValidation(loja);
  const warns = fields.filter((f) => f.status === "warn").length;
  const ok = warns === 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        ok
          ? "JSON válido — click para inspecionar"
          : `${warns} divergência${warns === 1 ? "" : "s"} — click para revisar`
      }
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors hover:brightness-110"
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
      <span className="text-[11px]">
        {ok ? "ok" : `${warns}`}
      </span>
    </button>
  );
}

function LojaFilter({
  rows,
  value,
  onChange,
}: {
  rows: LojaRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft com value externo (ex: chip "limpar").
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const q = draft.trim().toLowerCase();
  const distinct = useMemo(() => {
    const seen = new Set<string>();
    const out: { nome: string; clienteNome: string | null }[] = [];
    for (const r of rows) {
      const nome = r.loja.nome ?? "";
      const key = `${r.clienteId}::${nome}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ nome, clienteNome: r.clienteNome });
    }
    return out.sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
    );
  }, [rows]);
  const matches = q
    ? distinct.filter((d) => d.nome.toLowerCase().includes(q))
    : distinct;

  function commit() {
    onChange(draft);
    setOpen(false);
  }
  function clear() {
    setDraft("");
    onChange("");
  }

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition-colors"
        style={{
          backgroundColor: "var(--ink-3)",
          color: open || value.trim() ? "var(--mint-300)" : "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
          height: "26px",
        }}
        title="Filtrar por loja"
      >
        <span aria-hidden className="text-[10px]">⏷</span>
        <span>Filtrar loja</span>
        <span aria-hidden className="text-[9px]">▾</span>
      </button>

      {value.trim() && (
        <span
          className="chip chip-mint text-[11px] px-2 py-0.5 inline-flex items-center gap-1.5"
          style={{ height: "26px" }}
        >
          <span>"{value.trim()}"</span>
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar filtro"
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </span>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1.5 z-30 w-[300px] rounded-md"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
          }}
        >
          <div
            className="p-2"
            style={{ borderBottom: "1px solid var(--b-soft)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                onChange(e.target.value); // live-filter
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder="Digite parte do nome da loja..."
              className="w-full text-[12.5px] px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
            <p className="text-[10.5px] text-[color:var(--fg-subtle)] mt-1.5">
              Filtra ao vivo · Enter consolida e fecha
            </p>
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-[color:var(--fg-subtle)] text-center">
                Nenhuma loja com esse termo.
              </div>
            ) : (
              matches.slice(0, 50).map((m, i) => (
                <button
                  key={`${m.nome}-${i}`}
                  type="button"
                  onClick={() => {
                    setDraft(m.nome);
                    onChange(m.nome);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--ink-3)] transition-colors"
                >
                  <div className="text-[12.5px] truncate">
                    {m.nome || "(sem nome)"}
                  </div>
                  {m.clienteNome && (
                    <div className="text-[10.5px] text-[color:var(--fg-subtle)] truncate">
                      {m.clienteNome}
                    </div>
                  )}
                </button>
              ))
            )}
            {matches.length > 50 && (
              <div className="px-3 py-1.5 text-[10.5px] text-[color:var(--fg-subtle)] text-center">
                + {matches.length - 50} resultados — refine a busca.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthBadge({
  loja,
  onOpen,
}: {
  loja: Loja;
  onOpen: () => void;
}) {
  const { pendencias, drift, total } = totalIssues(loja);
  const ok = total === 0;
  const labelOn = "completo";
  const labelOff = `${total} pendente${total === 1 ? "" : "s"}`;
  const alertText = "var(--rose-300)";
  const alertDot = "var(--rose-300)";
  const alertBg = "var(--rose-bg)";
  const alertBorder = "var(--rose-border)";

  const tooltipParts: string[] = [];
  if (pendencias.length > 0) {
    tooltipParts.push(
      `Faltando: ${pendencias.map((p) => p.label).join(", ")}`,
    );
  }
  if (drift.length > 0) {
    tooltipParts.push(`Shape drift: ${drift.length} divergência(s)`);
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        ok
          ? "Cadastro completo — click pra editar"
          : tooltipParts.join(" · ")
      }
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-colors hover:brightness-110"
      style={{
        backgroundColor: ok ? "var(--ink-3)" : alertBg,
        border: ok
          ? "1px solid var(--b-base)"
          : `1px solid ${alertBorder}`,
        color: ok ? "var(--mint-300)" : alertText,
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: ok ? "var(--mint-300)" : alertDot }}
      />
      <span className="text-[11px]">{ok ? labelOn : labelOff}</span>
    </button>
  );
}

function CellEditor({
  def,
  loja,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  loja: Loja;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | number | null) => void;
}) {
  const initial = (() => {
    const v = (loja as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isNumeric = def.editKind === "numeric";

  useEffect(() => {
    if (isNumeric) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isNumeric]);

  // Auto-resize vertical: ajusta height ao scrollHeight a cada change.
  useEffect(() => {
    if (isNumeric) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, isNumeric]);

  function commit() {
    if (isNumeric) {
      const n =
        text.trim() === "" ? 0 : Number(text.replace(",", "."));
      if (!Number.isFinite(n)) return;
      onCommit(n);
    } else {
      onCommit(text);
    }
  }

  // Largura dinâmica: cresce em ch até 80. Após isso, textarea wrappa
  // e altura cresce via auto-resize.
  const dynamicWidth = `${Math.min(80, Math.max(8, text.length + 2))}ch`;

  return (
    <span
      className="inline-flex items-start gap-1"
      style={{
        position: "relative",
        zIndex: 10,
      }}
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
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter salva; Shift+Enter quebra linha.
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
            textAlign: def.align === "center" ? "center" : undefined,
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
        aria-label="Salvar"
      >
        ✓
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        disabled={pending}
        className="text-[10px] text-[color:var(--fg-subtle)]"
        aria-label="Cancelar"
      >
        ✕
      </button>
    </span>
  );
}
