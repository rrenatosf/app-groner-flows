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
import type { Vendedor } from "@/lib/db/schema";
import { SearchBox } from "@/components/search-box";
import {
  AcessarButton,
  BooleanToggle,
  ColumnPicker,
  CopyButton,
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
  applyVendedorCanonicalShape,
  updateVendedorCell,
  updateVendedorFields,
  validateVendedorAgendaAction,
  type EditableVendedorKey,
} from "./actions";
import {
  CONEXAO_LABELS,
  CONEXAO_DESCRICOES,
  PERMISSAO_LABELS,
  PERMISSAO_DESCRICOES,
  corConexao,
  corPermissao,
  type ResultadoAgenda,
} from "@/lib/agenda";
import { UsuarioEditModal } from "./usuario-edit-modal";
import { UsuarioNovoModal } from "./usuario-novo-modal";
import { buildVendedorValidation, totalIssues } from "./saude-usuario";

export type UsuarioRow = {
  clienteId: number;
  clienteNome: string | null;
  clienteTenant: string | null;
  vendedor: Vendedor;
  /** Mapa de uuid → nome de loja, pra display da coluna lojas. */
  lojasMap: Record<string, string>;
  /** Lista de lojas do mesmo cliente (pra picker). */
  lojasDoCliente: { id: string; nome: string }[];
};

type ColKey =
  | "tenant"
  | "nome"
  | "email"
  | "telefone"
  | "role"
  | "lojas"
  | "is_active"
  | "recebe_agendamento"
  | "crm_id"
  | "agenda"
  | "saude"
  | "validacao"
  // Drilldown only — sempre fim, não reordenável, não no ColumnPicker.
  | "acoes";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  superOnly?: boolean;
  readOnly?: boolean;
  editKind?: "text" | "boolean" | "role";
  /** Quando `false`, header não responde a click pra ordenar. */
  sortable?: boolean;
};

const COLUMNS: ColDef[] = [
  { key: "tenant", label: "Cliente", superOnly: true, readOnly: true },
  { key: "nome", label: "Nome", editKind: "text" },
  { key: "email", label: "E-mail", editKind: "text" },
  { key: "telefone", label: "Telefone", editKind: "text" },
  { key: "role", label: "Função", align: "center", editKind: "role" },
  { key: "lojas", label: "Lojas", readOnly: false },
  { key: "is_active", label: "Ativo", align: "center", editKind: "boolean" },
  { key: "recebe_agendamento", label: "Recebe agend.", align: "center", editKind: "boolean" },
  { key: "crm_id", label: "CRM ID", editKind: "text" },
  { key: "agenda", label: "Agenda", align: "center", readOnly: true },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  { key: "validacao", label: "Validação JSON", align: "center", readOnly: true, superOnly: true },
  // Drilldown — sempre última coluna, fixa à direita, não no picker.
  { key: "acoes", label: "Ações", align: "right", readOnly: true, sortable: false },
];

const STORAGE_HIDDEN = "groner.usuarios.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.usuarios.page_size_v1";
const ACTION_COL_KEYS: ColKey[] = ["validacao"];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s.length === 0 ? "—" : s;
}

function valueFor(r: UsuarioRow, key: ColKey): unknown {
  if (key === "tenant") return r.clienteNome ?? r.clienteTenant ?? "";
  if (key === "saude") return totalIssues(r.vendedor).total;
  if (key === "validacao") return 0;
  if (key === "agenda") return 0;
  if (key === "acoes") return 0;
  if (key === "lojas") {
    return (r.vendedor.loja_ids ?? [])
      .map((id) => r.lojasMap[id] ?? id.slice(0, 8))
      .join(", ");
  }
  if (key === "role") {
    return r.vendedor.role === "owner" ? "Admin" : "Usuário";
  }
  return (r.vendedor as unknown as Record<string, unknown>)[key];
}

function isCellMissing(r: UsuarioRow, key: ColKey): boolean {
  if (
    key === "tenant" ||
    key === "saude" ||
    key === "validacao" ||
    key === "agenda" ||
    key === "acoes" ||
    key === "is_active" ||
    key === "recebe_agendamento" ||
    key === "role"
  )
    return false;
  if (key === "lojas")
    return (r.vendedor.loja_ids ?? []).length === 0;
  const v = (r.vendedor as unknown as Record<string, unknown>)[key];
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
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
}

export function UsuariosTable({
  rows,
  isSuper,
  canEdit,
  embedded = false,
  embeddedClienteId,
  embeddedClienteNome,
  embeddedLojasDoCliente,
  embeddedLojaIdPreSelected,
}: {
  rows: UsuarioRow[];
  isSuper: boolean;
  canEdit: boolean;
  /** Renderiza dentro do drilldown — esconde toolbar redundante. */
  embedded?: boolean;
  /** Quando vier preenchido, modal "Novo usuário" trava nesse cliente
   *  (drilldown). Independe de `rows` — funciona mesmo com lista vazia. */
  embeddedClienteId?: number;
  embeddedClienteNome?: string;
  embeddedLojasDoCliente?: { id: string; nome: string }[];
  /** Drilldown loja: pré-marca essa loja no checklist do modal "Novo". */
  embeddedLojaIdPreSelected?: string;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("usuarios");

  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter(
        (c) =>
          (!c.superOnly || isSuper) &&
          (!embedded || c.key !== "acoes") &&
          (showHealth ||
            (c.key !== "saude" && c.key !== "validacao")),
      ),
    [isSuper, embedded, showHealth],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);
  // ColumnPicker: `acoes` nunca aparece — não é ocultável.
  const pickerDefs = useMemo(
    () => visibleDefs.filter((d) => d.key !== "acoes"),
    [visibleDefs],
  );

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

  // Filtro super-only.
  const [filtro, setFiltro] = useState("");
  // Filtro por loja — disponível pra qualquer kind, contexto multi-loja.
  const [lojaFilter, setLojaFilter] = useState<string>("");
  // Lista de lojas distintas presentes nos rows (rotuladas via lojasMap).
  const lojasDisponiveis = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      for (const id of r.vendedor.loja_ids ?? []) {
        if (!seen.has(id)) seen.set(id, r.lojasMap[id] ?? id.slice(0, 8));
      }
    }
    return Array.from(seen.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      );
  }, [rows]);
  const filteredRows = useMemo(() => {
    let out = sortedRows;
    if (lojaFilter) {
      if (lojaFilter === "__nenhuma__") {
        out = out.filter((r) => (r.vendedor.loja_ids ?? []).length === 0);
      } else {
        out = out.filter((r) =>
          (r.vendedor.loja_ids ?? []).includes(lojaFilter),
        );
      }
    }
    const q = filtro.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        String(r.vendedor.nome ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [sortedRows, filtro, lojaFilter]);

  // Group by loja super-only.
  const [groupByLoja, setGroupByLoja] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleCollapse(k: string) {
    const next = new Set(collapsed);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setCollapsed(next);
  }
  type Group = {
    key: string;
    headerLabel: string;
    rows: UsuarioRow[];
  };
  const grouped: Group[] | null = useMemo(() => {
    if (!groupByLoja) return null;
    const map = new Map<string, Group>();
    for (const r of filteredRows) {
      const lojaIds = r.vendedor.loja_ids ?? [];
      if (lojaIds.length === 0) {
        const k = `none-${r.clienteId}`;
        if (!map.has(k))
          map.set(k, {
            key: k,
            headerLabel: `(sem loja) · ${r.clienteNome ?? r.clienteTenant ?? "—"}`,
            rows: [],
          });
        map.get(k)!.rows.push(r);
        continue;
      }
      for (const lid of lojaIds) {
        const k = `${r.clienteId}-${lid}`;
        if (!map.has(k)) {
          const lojaNome = r.lojasMap[lid] ?? "(loja desconhecida)";
          const tenant =
            r.clienteNome ?? r.clienteTenant ?? `cli ${r.clienteId}`;
          map.set(k, {
            key: k,
            headerLabel: `${lojaNome} · ${tenant}`,
            rows: [],
          });
        }
        map.get(k)!.rows.push(r);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.headerLabel.localeCompare(b.headerLabel, "pt-BR", {
        sensitivity: "base",
      }),
    );
  }, [groupByLoja, filteredRows]);

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

  // Inline edit.
  const [editing, setEditing] = useState<{
    clienteId: number;
    uid: string;
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

  function startEdit(clienteId: number, uid: string, key: ColKey) {
    setSaveErr(null);
    setEditing({ clienteId, uid, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | boolean | null) {
    if (!editing) return;
    const { clienteId, uid, key } = editing;
    startTransition(async () => {
      const res = await updateVendedorCell(
        clienteId,
        uid,
        key as EditableVendedorKey,
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

  function commitLojaIds(
    clienteId: number,
    uid: string,
    nextIds: string[],
  ) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateVendedorFields(clienteId, uid, {
        loja_ids: nextIds,
      });
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleBoolean(
    clienteId: number,
    uid: string,
    key: "is_active" | "recebe_agendamento",
    current: boolean,
  ) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateVendedorCell(
        clienteId,
        uid,
        key as EditableVendedorKey,
        !current,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Modais.
  const [novoOpen, setNovoOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UsuarioRow | null>(null);
  const [validacaoTarget, setValidacaoTarget] = useState<UsuarioRow | null>(null);

  // Verificação de agenda — só roda quando user clica no badge.
  type AgendaState =
    | { state: "idle" }
    | { state: "loading" }
    | { state: "done"; result: ResultadoAgenda };
  const [agendaResults, setAgendaResults] = useState<Record<string, AgendaState>>({});
  function checkAgenda(clienteId: number, uid: string) {
    setAgendaResults((prev) => ({ ...prev, [uid]: { state: "loading" } }));
    void (async () => {
      const result = await validateVendedorAgendaAction(clienteId, uid);
      setAgendaResults((prev) => ({
        ...prev,
        [uid]: { state: "done", result },
      }));
    })();
  }
  const [pendingShape, startShape] = useTransition();
  function handleApplyShape() {
    if (!validacaoTarget) return;
    startShape(async () => {
      const res = await applyVendedorCanonicalShape(
        validacaoTarget.clienteId,
        validacaoTarget.vendedor.uid,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setValidacaoTarget(null);
      router.refresh();
    });
  }

  const orderedDefs = useMemo(() => {
    const filtered = visibleDefs.filter((d) => !hidden.has(d.key));
    // `acoes` sempre por último.
    const acoesIdx = filtered.findIndex((d) => d.key === "acoes");
    if (acoesIdx >= 0 && acoesIdx !== filtered.length - 1) {
      const [acoesDef] = filtered.splice(acoesIdx, 1);
      filtered.push(acoesDef);
    }
    return filtered;
  }, [visibleDefs, hidden]);

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
            `/clientes/${row.clienteId}/vendedores/${row.vendedor.uid}/dados`,
          );
          return;
        }
        if (def && row && canEdit && !def.readOnly) {
          e.preventDefault();
          startEdit(row.clienteId, row.vendedor.uid, def.key);
        }
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, moveSelection, selected, pagedRows, orderedDefs, canEdit, router]);

  function renderRow(
    r: UsuarioRow,
    rIdx: number,
    opts?: { grouped?: boolean },
  ) {
    const uid = r.vendedor.uid;
    const inGroup = opts?.grouped === true;
    return (
      <tr
        key={`${r.clienteId}-${uid}`}
        onDoubleClick={() =>
          router.push(
            `/clientes/${r.clienteId}/vendedores/${uid}/dados`,
          )
        }
        style={{ cursor: "pointer" }}
      >
        {orderedDefs.map((d, ci) => {
          const isEditing =
            editing?.clienteId === r.clienteId &&
            editing?.uid === uid &&
            editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === ci;
          const editable =
            canEdit && !d.readOnly && (!d.superOnly || isSuper);
          const isBoolToggle =
            d.editKind === "boolean" && editable && !isEditing;
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
              {d.key === "acoes" ? (
                <AcessarButton
                  href={`/clientes/${r.clienteId}/vendedores/${uid}/dados`}
                  ariaLabel={`Acessar dados do vendedor ${r.vendedor.nome?.trim() || `#${uid.slice(0, 8)}`}`}
                />
              ) : d.key === "saude" ? (
                <HealthBadge
                  vendedor={r.vendedor}
                  onOpen={() =>
                    router.push(
                      `/clientes/${r.clienteId}/vendedores/${r.vendedor.uid}/dados`,
                    )
                  }
                />
              ) : d.key === "validacao" ? (
                <ValidationBadgeUsuario
                  vendedor={r.vendedor}
                  onOpen={() => setValidacaoTarget(r)}
                />
              ) : d.key === "agenda" ? (
                <AgendaBadge
                  clienteId={r.clienteId}
                  vendedorUid={uid}
                  result={agendaResults[uid]}
                  onCheck={() => checkAgenda(r.clienteId, uid)}
                />
              ) : d.key === "lojas" ? (
                <LojasPicker
                  current={r.vendedor.loja_ids ?? []}
                  options={r.lojasDoCliente}
                  disabled={!canEdit || pending}
                  onChange={(ids) =>
                    commitLojaIds(r.clienteId, uid, ids)
                  }
                />
              ) : isBoolToggle && d.key !== "role" ? (
                <BooleanToggle
                  value={
                    !!(r.vendedor as unknown as Record<string, boolean>)[
                      d.key
                    ]
                  }
                  pending={pending}
                  offIsAlert={d.key === "is_active"}
                  ariaLabel={d.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBoolean(
                      r.clienteId,
                      uid,
                      d.key as "is_active" | "recebe_agendamento",
                      !!(r.vendedor as unknown as Record<string, boolean>)[
                        d.key
                      ],
                    );
                  }}
                />
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  vendedor={r.vendedor}
                  pending={pending}
                  onCancel={cancelEdit}
                  onCommit={commitEdit}
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 group/cell">
                  {d.key === "telefone" && r.vendedor.telefone && (
                    <CopyButton value={r.vendedor.telefone} />
                  )}
                  {d.key === "email" && r.vendedor.email && (
                    <CopyButton value={r.vendedor.email} />
                  )}
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
                        startEdit(r.clienteId, uid, d.key);
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
          <SearchBox compact placeholder="Buscar por nome, e-mail..." />
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
          {lojasDisponiveis.length > 0 && (
            <div style={{ width: 220 }}>
              <SearchableSelect
                items={[
                  { id: "__nenhuma__", nome: "(Sem loja)" },
                  ...lojasDisponiveis,
                ]}
                value={lojaFilter || null}
                onChange={(v) => setLojaFilter(v ?? "")}
                getKey={(o) => o.id}
                getLabel={(o) => o.nome}
                placeholder="Filtrar por loja..."
                searchPlaceholder="Buscar loja..."
                width={220}
              />
            </div>
          )}
          {isSuper && (
            <button
              type="button"
              onClick={() => {
                if (!groupByLoja) {
                  // Inicia com tudo colapsado.
                  const all = new Set<string>();
                  for (const r of filteredRows) {
                    const ids = r.vendedor.loja_ids ?? [];
                    if (ids.length === 0) all.add(`none-${r.clienteId}`);
                    else for (const lid of ids) all.add(`${r.clienteId}-${lid}`);
                  }
                  setCollapsed(all);
                  setGroupByLoja(true);
                } else {
                  setGroupByLoja(false);
                  setCollapsed(new Set());
                }
              }}
              className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5"
              style={{
                backgroundColor: "var(--ink-3)",
                color: groupByLoja
                  ? "var(--mint-300)"
                  : "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
                height: "26px",
              }}
              title={
                groupByLoja
                  ? "Desagrupar"
                  : "Agrupar usuários por loja"
              }
            >
              <span aria-hidden className="text-[10px]">⊟</span>
              <span>{groupByLoja ? "Desagrupar" : "Agrupar"}</span>
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
              <span>Novo usuário</span>
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
                  Nenhum usuário.
                </td>
              </tr>
            )}
            {grouped &&
              grouped.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr
                      onClick={() => toggleCollapse(g.key)}
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
                        <span
                          style={{
                            color: "var(--mint-300)",
                            marginRight: 6,
                          }}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {g.headerLabel}
                        <span
                          className="numerics ml-2"
                          style={{
                            color: "var(--fg-subtle)",
                            fontSize: "11px",
                          }}
                        >
                          · {g.rows.length} usuário
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
          {filteredRows.length} usuário
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

      {canEdit && (
        <UsuarioNovoModal
          open={novoOpen}
          rows={rows}
          isSuper={isSuper}
          forcedClienteId={embeddedClienteId}
          forcedClienteNome={embeddedClienteNome}
          forcedLojasDoCliente={embeddedLojasDoCliente}
          forcedLojaIdsPreSelected={
            embeddedLojaIdPreSelected
              ? [embeddedLojaIdPreSelected]
              : undefined
          }
          onClose={() => setNovoOpen(false)}
        />
      )}
      <UsuarioEditModal
        open={editTarget !== null}
        target={editTarget}
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        onClose={() => setEditTarget(null)}
      />
      <JsonValidationModal
        open={validacaoTarget !== null}
        title={`Usuário: ${validacaoTarget?.vendedor.nome ?? "(sem nome)"}`}
        subtitle={
          validacaoTarget
            ? `${validacaoTarget.clienteNome ?? "—"} · uid ${validacaoTarget.vendedor.uid.slice(0, 12)}…`
            : undefined
        }
        fields={
          validacaoTarget
            ? buildVendedorValidation(validacaoTarget.vendedor)
            : []
        }
        pending={pendingShape}
        onApply={canEdit ? handleApplyShape : undefined}
        onClose={() => setValidacaoTarget(null)}
      />
    </div>
  );
}

/** Picker inline pra lojas vinculadas. Botão na célula mostra count
 *  (ou nomes truncados); click abre dropdown com checkboxes das lojas
 *  do cliente. Toggle persiste imediatamente. */
function LojasPicker({
  current,
  options,
  disabled,
  onChange,
}: {
  current: string[];
  options: { id: string; nome: string }[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  function toggle(id: string) {
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onChange(next);
  }

  const label =
    current.length === 0
      ? "Sem loja"
      : current.length === 1
        ? options.find((o) => o.id === current[0])?.nome ??
          current[0].slice(0, 8)
        : `${current.length} lojas`;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((s) => !s);
        }}
        disabled={disabled}
        title="Editar lojas vinculadas"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors"
        style={{
          backgroundColor:
            current.length === 0 ? "var(--rose-bg)" : "var(--ink-3)",
          border:
            current.length === 0
              ? "1px solid var(--rose-border)"
              : "1px solid var(--b-base)",
          color:
            current.length === 0 ? "var(--rose-300)" : "var(--mint-300)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          maxWidth: "20ch",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          className="size-1.5 rounded-full shrink-0"
          style={{
            backgroundColor:
              current.length === 0
                ? "var(--rose-300)"
                : "var(--mint-300)",
          }}
        />
        <span className="text-[11px] truncate">{label}</span>
        <span aria-hidden className="text-[9px] shrink-0">▾</span>
      </button>
      {open && pos && (
        <div
          role="dialog"
          className="rounded-md p-2"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 60,
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
            minWidth: 220,
            maxHeight: 240,
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="text-[11.5px] text-[color:var(--fg-subtle)] px-2 py-2">
              Cliente sem lojas cadastradas.
            </div>
          ) : (
            options.map((o) => {
              const checked = current.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-[color:var(--ink-3)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    disabled={disabled}
                    className="accent-[color:var(--mint-300)]"
                  />
                  <span
                    className="text-[12.5px]"
                    style={{
                      color: checked ? "var(--mint-200)" : "var(--fg)",
                    }}
                  >
                    {o.nome}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function HealthBadge({
  vendedor,
  onOpen,
}: {
  vendedor: Vendedor;
  onOpen: () => void;
}) {
  const { total } = totalIssues(vendedor);
  const ok = total === 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
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
        {ok ? "completo" : `${total} pendente${total === 1 ? "" : "s"}`}
      </span>
    </button>
  );
}

function ValidationBadgeUsuario({
  vendedor,
  onOpen,
}: {
  vendedor: Vendedor;
  onOpen: () => void;
}) {
  const fields = buildVendedorValidation(vendedor);
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
  vendedor,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  vendedor: Vendedor;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | boolean | null) => void;
}) {
  const initial = (() => {
    if (def.key === "role") return vendedor.role;
    const v = (vendedor as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const useTextarea = def.editKind === "text";

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);
  useEffect(() => {
    if (!useTextarea) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, useTextarea]);

  const dynamicWidth = `${Math.min(80, Math.max(8, text.length + 2))}ch`;

  if (def.editKind === "role") {
    return (
      <span className="inline-flex items-center gap-1">
        <select
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(text);
            else if (e.key === "Escape") onCancel();
          }}
          disabled={pending}
          className="text-[12px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--mint-300)",
            color: "var(--fg)",
          }}
        >
          <option value="vendedor">Usuário</option>
          <option value="owner">Admin</option>
        </select>
        <button
          type="button"
          onClick={() => onCommit(text)}
          className="text-[10px] text-[color:var(--mint-300)]"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-[color:var(--fg-subtle)]"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-start gap-1"
      style={{ position: "relative", zIndex: 10 }}
    >
      <textarea
        ref={taRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onCommit(text);
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
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onCommit(text)}
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

function AgendaBadge({
  result,
  onCheck,
}: {
  clienteId: number;
  vendedorUid: string;
  result:
    | { state: "idle" }
    | { state: "loading" }
    | { state: "done"; result: ResultadoAgenda }
    | undefined;
  onCheck: () => void;
}) {
  const s = result?.state ?? "idle";
  if (s === "idle") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCheck();
        }}
        title="Verificar conexão e permissão da agenda Google."
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:brightness-110"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
          cursor: "pointer",
        }}
      >
        <span aria-hidden>↻</span>
        <span className="text-[11px]">verificar</span>
      </button>
    );
  }
  if (s === "loading") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md"
        style={{
          backgroundColor: "rgba(220,180,80,0.08)",
          color: "var(--amber-300)",
          border: "1px solid rgba(220,180,80,0.32)",
        }}
      >
        <span aria-hidden>…</span>
        <span className="text-[11px]">verificando</span>
      </span>
    );
  }
  if (result?.state !== "done") return null;
  const r = result.result;
  const cConn = corConexao(r.conexao);
  const cPerm = corPermissao(r.permissao);
  const tooltip =
    `${CONEXAO_LABELS[r.conexao]}: ${CONEXAO_DESCRICOES[r.conexao]}\n` +
    `${PERMISSAO_LABELS[r.permissao]}: ${PERMISSAO_DESCRICOES[r.permissao]}` +
    (r.detail ? `\n\nDetalhe: ${r.detail}` : "") +
    `\n\nClick pra recheck.`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCheck();
      }}
      title={tooltip}
      className="inline-flex items-center gap-1 hover:brightness-110"
      style={{ cursor: "pointer" }}
    >
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
        style={{
          backgroundColor: cConn.bg,
          color: cConn.fg,
          border: `1px solid ${cConn.border}`,
        }}
      >
        <span aria-hidden className="text-[10px]">
          {cConn.glyph}
        </span>
        <span className="text-[10.5px]">{CONEXAO_LABELS[r.conexao]}</span>
      </span>
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
        style={{
          backgroundColor: cPerm.bg,
          color: cPerm.fg,
          border: `1px solid ${cPerm.border}`,
        }}
      >
        <span aria-hidden className="text-[10px]">
          {cPerm.glyph}
        </span>
        <span className="text-[10.5px]">{PERMISSAO_LABELS[r.permissao]}</span>
      </span>
    </button>
  );
}
