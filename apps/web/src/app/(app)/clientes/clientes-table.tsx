"use client";

// [TABELAS.md] drag-reorder de colunas existe aqui mas NÃO faz parte do
// padrão canônico atualizado. Manter por enquanto. Avaliar remoção em
// refator futuro (col_order_v1 marcada como DEPRECATED em docs/TABELAS.md).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { updateClienteCell, type EditableKey } from "./actions";
import { ClienteNovoModal } from "./cliente-novo-modal";
import { ClienteEditModal } from "./cliente-edit-modal";
import { buildClienteValidation, pendenciasFor } from "./saude";
import { checkWhatsappStatusForClienteAction } from "@/server/actions/cliente-crm";
import { PasswordConfirm } from "@/components/password-confirm";
import {
  BooleanToggle,
  ColumnPicker,
  CopyButton,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconInfo,
  IconWarn,
  JsonValidationModal,
  PAGE_SIZE_OPTIONS,
  SearchableSelect,
  SecretActions,
  TablePagination,
  type PageSize,
} from "@/components/data-table";

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export type ClienteRow = {
  id: number;
  createdAt: Date | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  senha: string | null;
  isActive: boolean | null;
  apiToken: string | null;
  apiInstanciaNome: string | null;
  apiBaseUrl: string | null;
  crmTenant: string | null;
  crmToken: string | null;
  crmOrigemId: string | null;
  crmStatusColunas: import("@/lib/db/schema").CrmStatusSlot[] | null;
  isSuperadmin: boolean | null;
};

type ColKey =
  | "nome"
  | "email"
  | "telefone"
  | "senha"
  | "crmTenant"
  | "apiInstanciaNome"
  | "apiBaseUrl"
  | "apiToken"
  | "crmToken"
  | "crmOrigemId"
  | "isActive"
  | "isSuperadmin"
  | "createdAt"
  // Virtual — só front, não persistida.
  | "saude"
  | "validacao"
  | "wa_status";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  superOnly?: boolean;
  /** Não editável (createdAt é gerenciado pelo banco). */
  readOnly?: boolean;
  /** Tipo de input no modo edição. */
  editKind?: "text" | "boolean";
  /** Quando `false`, header não responde a click pra ordenar
   *  (ex: coluna `acoes`). Default: undefined → ordenável. */
  sortable?: boolean;
};

const COLUMNS: ColDef[] = [
  // Visíveis pra cliente comum + super.
  { key: "nome", label: "Nome", editKind: "text" },
  { key: "email", label: "E-mail", editKind: "text" },
  { key: "telefone", label: "Telefone", editKind: "text" },
  { key: "crmTenant", label: "Tenant", editKind: "text" },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  { key: "wa_status", label: "Status WA", align: "center", readOnly: true, superOnly: true },
  { key: "validacao", label: "Validação JSON", align: "center", readOnly: true, superOnly: true },
  // Restantes — só super.
  { key: "senha", label: "Senha", superOnly: true, editKind: "text" },
  { key: "apiInstanciaNome", label: "Instância", superOnly: true, editKind: "text" },
  { key: "apiBaseUrl", label: "Base URL", superOnly: true, editKind: "text" },
  { key: "apiToken", label: "API Token", superOnly: true, editKind: "text" },
  { key: "crmToken", label: "CRM Token", superOnly: true, editKind: "text" },
  { key: "crmOrigemId", label: "CRM Origem", align: "center", superOnly: true, editKind: "text" },
  { key: "isActive", label: "Ativo", align: "center", superOnly: true, editKind: "boolean" },
  { key: "isSuperadmin", label: "Superadmin", align: "center", superOnly: true, editKind: "boolean" },
  { key: "createdAt", label: "Criado em", align: "center", superOnly: true, readOnly: true },
];

const STORAGE_ORDER = "groner.clientes.col_order_v1";
const STORAGE_HIDDEN = "groner.clientes.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.clientes.page_size_v1";

// Campos com mask/eye/copy. Senha é hash bcrypt (não plaintext) —
// revelar mostra o hash; copy copia o hash. Edição grava nova senha
// hasheada via server action.
const SECRET_KEYS = new Set<ColKey>([
  "apiToken",
  "crmToken",
  "apiBaseUrl",
  "senha",
]);

function fmtSecretMasked(v: string | null): string {
  if (!v) return "—";
  return "••••••••";
}
function fmtSecretRevealed(v: string | null): string {
  if (!v) return "—";
  return v;
}

function fmtVal(v: string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length === 0 ? "—" : s;
}

/** Detecta célula com valor ausente — usado pra mostrar indicador
 *  amarelo "i". Booleans, datas e coluna virtual saude nunca são "missing". */
function isCellMissing(c: ClienteRow, key: ColKey): boolean {
  if (
    key === "saude" ||
    key === "validacao" ||
    key === "wa_status" ||
    key === "createdAt" ||
    key === "isActive" ||
    key === "isSuperadmin"
  ) {
    return false;
  }
  const v = (c as unknown as Record<string, unknown>)[key];
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
  if (av instanceof Date && bv instanceof Date) {
    return av.getTime() - bv.getTime();
  }
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
}

function renderCell(
  c: ClienteRow,
  key: ColKey,
): { node: React.ReactNode; className: string } {
  switch (key) {
    case "nome":
      return { node: fmtVal(c.nome), className: "font-medium" };
    case "email":
      return { node: fmtVal(c.email), className: "text-[color:var(--fg-muted)]" };
    case "telefone":
      return {
        node: fmtVal(c.telefone),
        className: "numerics text-[color:var(--fg-muted)]",
      };
    case "crmTenant":
      return {
        node: fmtVal(c.crmTenant),
        className: "numerics text-[color:var(--fg-muted)]",
      };
    case "apiInstanciaNome":
      return {
        node: fmtVal(c.apiInstanciaNome),
        className: "text-[color:var(--fg-muted)]",
      };
    case "apiBaseUrl":
    case "apiToken":
    case "crmToken":
    case "senha":
      // Renderizado inline no tbody (precisa de state pra reveal).
      return { node: null, className: "text-[color:var(--fg-muted)]" };
    case "crmOrigemId":
      return {
        node: fmtVal(c.crmOrigemId),
        className: "numerics text-[color:var(--fg-muted)]",
      };
    case "isActive":
      return {
        node: (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: c.isActive
                  ? "var(--mint-300)"
                  : "var(--fg-disabled)",
              }}
            />
            <span
              className="text-[11.5px]"
              style={{
                color: c.isActive
                  ? "var(--mint-300)"
                  : "var(--fg-disabled)",
              }}
            >
              {c.isActive ? "ativo" : "inativo"}
            </span>
          </span>
        ),
        className: "text-center",
      };
    case "isSuperadmin":
      return {
        node: c.isSuperadmin ? (
          <span className="chip chip-mint text-[10.5px] px-1.5 py-0.5">
            Superadmin
          </span>
        ) : (
          <span className="text-[10.5px] text-[color:var(--fg-disabled)]">—</span>
        ),
        className: "text-center",
      };
    case "createdAt":
      return {
        node: c.createdAt ? dt.format(new Date(c.createdAt)) : "—",
        className: "numerics text-[color:var(--fg-muted)]",
      };
    case "saude":
    case "validacao":
    case "wa_status":
      // Renderizado inline no tbody.
      return { node: null, className: "" };
  }
}

function valueFor(c: ClienteRow, key: ColKey): unknown {
  return (c as unknown as Record<string, unknown>)[key];
}

export function ClientesTable({
  rows,
  isSuper,
  embedded = false,
}: {
  rows: ClienteRow[];
  isSuper: boolean;
  /** Quando renderizada dentro de drilldown (ex: aba). Esconde header
   *  PageHeader/título "+Novo cliente" e detalhes redundantes. */
  embedded?: boolean;
}) {
  const router = useRouter();

  // Lista de colunas visíveis (filtra superOnly se não-super; remove
  const visibleDefs = useMemo(
    () => COLUMNS.filter((c) => !c.superOnly || isSuper),
    [isSuper],
  );
  const visibleKeys = useMemo(() => visibleDefs.map((c) => c.key), [visibleDefs]);
  const pickerDefs = visibleDefs;

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
  const resetOrder = useCallback(() => {
    setOrder(visibleKeys);
    try {
      localStorage.removeItem(STORAGE_ORDER);
    } catch {
      /* ignore */
    }
  }, [visibleKeys]);

  // ─── Visibilidade por coluna ────────────────────────────────────────
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
      localStorage.setItem(
        STORAGE_HIDDEN,
        JSON.stringify(Array.from(next)),
      );
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
  function showAllCols() {
    persistHidden(new Set());
  }

  useEffect(() => {
    function onReset() {
      resetOrder();
    }
    window.addEventListener("groner:clientes-reset-order", onReset);
    return () =>
      window.removeEventListener("groner:clientes-reset-order", onReset);
  }, [resetOrder]);

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
      const r =
        sortKey === "saude"
          ? pendenciasFor(a, { isSuper }).length -
            pendenciasFor(b, { isSuper }).length
          : cmp(valueFor(a, sortKey), valueFor(b, sortKey));
      return sortDir === "desc" ? -r : r;
    });
    return arr;
  }, [rows, sortKey, sortDir, isSuper]);

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
    return out.filter((d) => !hidden.has(d.key));
  }, [order, visibleDefs, hidden]);

  // ─── Reveal de tokens ───────────────────────────────────────────────
  // Default sempre oculto — não persiste entre reloads.
  const [colReveal, setColReveal] = useState<Set<ColKey>>(new Set());
  const [rowReveal, setRowReveal] = useState<Set<string>>(new Set());

  function toggleColReveal(k: ColKey) {
    setColReveal((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleRowReveal(rowId: number, k: ColKey) {
    setRowReveal((prev) => {
      const next = new Set(prev);
      const key = `${rowId}-${k}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function isTokenRevealed(rowId: number, k: ColKey): boolean {
    return colReveal.has(k) || rowReveal.has(`${rowId}-${k}`);
  }

  // ─── Seleção / navegação por teclado / edição inline ────────────────
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(
    null,
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ rowId: number; key: ColKey } | null>(
    null,
  );
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tableRef = useRef<HTMLTableElement>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  // editTarget legado — mantido pra compat com `HealthBadge.onOpen`
  // (botão pendências). Row click foi promovido a router.push pra
  // /clientes/[id]/dados (drilldown). NOVO: HealthBadge agora também
  // navega via router em vez de abrir modal — mas deixamos o state
  // pra evitar mudança maior em ValidationBadge.
  const [editTarget, setEditTarget] = useState<{
    cliente: ClienteRow;
  } | null>(null);
  const [validacaoTarget, setValidacaoTarget] = useState<ClienteRow | null>(
    null,
  );

  // Status WhatsApp auto-fetch (só super, fetcha pra cada cliente).
  type WaStatus = {
    state: "idle" | "loading" | "connected" | "disconnected" | "error" | "no-instance";
    label: string;
    /** Mensagem detalhada do erro (visível no tooltip + accessível). */
    errorDetail?: string;
  };
  const [waStatus, setWaStatus] = useState<Record<number, WaStatus>>({});

  // Inicializa estado dos clientes sem disparar requisições. Verificação
  // do WhatsApp só roda quando o usuário clica no botão de recheck.
  useEffect(() => {
    if (!isSuper) return;
    setWaStatus((prev) => {
      const next = { ...prev };
      for (const c of rows) {
        if (next[c.id]) continue;
        if (!c.apiInstanciaNome || !c.apiToken) {
          next[c.id] = {
            state: "no-instance",
            label: "sem instância",
            errorDetail:
              "Cliente não tem apiInstanciaNome ou apiToken configurado. Configure no modal de edição antes de checar status.",
          };
        } else {
          next[c.id] = { state: "idle", label: "não verificado" };
        }
      }
      return next;
    });
  }, [isSuper, rows]);

  function refetchWaStatus(clienteId: number) {
    setWaStatus((prev) => ({
      ...prev,
      [clienteId]: { state: "loading", label: "checando…" },
    }));
    void (async () => {
      try {
        const res = await checkWhatsappStatusForClienteAction(clienteId);
        if (!res.ok) {
          setWaStatus((prev) => ({
            ...prev,
            [clienteId]: {
              state: "error",
              label: "erro",
              errorDetail: res.error,
            },
          }));
          return;
        }
        const status = (res.status ?? "").toLowerCase();
        let s: WaStatus["state"] = "disconnected";
        if (status === "connected" || status === "open") s = "connected";
        setWaStatus((prev) => ({
          ...prev,
          [clienteId]: { state: s, label: status || "offline" },
        }));
      } catch (e) {
        setWaStatus((prev) => ({
          ...prev,
          [clienteId]: {
            state: "error",
            label: "erro",
            errorDetail:
              e instanceof Error
                ? e.message
                : "Erro de rede ou exceção desconhecida.",
          },
        }));
      }
    })();
  }

  // Paginação — persistência de pageSize.
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
  // Reset page index quando rows mudam (ex: search/filter).
  useEffect(() => {
    setPageIndex(0);
  }, [rows.length]);

  // Filtro super-only: mostrar só um cliente específico.
  const [clienteFilter, setClienteFilter] = useState<number | null>(null);
  const filteredRows = useMemo(() => {
    if (clienteFilter === null) return sortedRows;
    return sortedRows.filter((r) => r.id === clienteFilter);
  }, [sortedRows, clienteFilter]);
  useEffect(() => {
    setPageIndex(0);
  }, [clienteFilter]);

  // Slice paginado.
  const pagedRows = useMemo(
    () => filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [filteredRows, pageIndex, pageSize],
  );
  // Pending privilege escalation: pra ativar isSuperadmin precisamos
  // confirmar a senha do super atual antes de chamar a action.
  const [confirmSuper, setConfirmSuper] = useState<{
    rowId: number;
    next: boolean;
    error: string | null;
  } | null>(null);

  // Limpa seleção/edição se rows mudam (após save + revalidate).
  useEffect(() => {
    setEditing(null);
  }, [rows]);

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

  // Listener global de teclado (só quando não está editando).
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
      } else if (e.key === "s" || e.key === "S") {
        if (!selected) return;
        const row = pagedRows[selected.r];
        if (!row) return;
        e.preventDefault();
        setSelectedRows((prev) => {
          const next = new Set(prev);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
      } else if (e.key === "Enter" && selected) {
        const def = orderedDefs[selected.c];
        const row = pagedRows[selected.r];
        // Enter na coluna Nome: navega pro drilldown.
        if (def?.key === "nome" && row) {
          e.preventDefault();
          router.push(`/clientes/${row.id}/dados`);
          return;
        }
        if (def && row && !def.readOnly) {
          if (!isSuper && def.superOnly) return;
          e.preventDefault();
          setEditing({ rowId: row.id, key: def.key });
        }
      } else if (e.key === "Escape") {
        if (selectedRows.size > 0) setSelectedRows(new Set());
        else setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, moveSelection, selected, pagedRows, orderedDefs, isSuper, selectedRows, router]);

  function startEdit(rowId: number, key: ColKey) {
    setSaveErr(null);
    setEditing({ rowId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | boolean | null) {
    if (!editing) return;
    const { rowId, key } = editing;
    startTransition(async () => {
      const res = await updateClienteCell(rowId, key as EditableKey, value);
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      setSaveErr(null);
      setEditing(null);
      router.refresh();
    });
  }

  function toggleBoolean(rowId: number, key: ColKey, current: boolean | null) {
    setSaveErr(null);
    if (key === "isSuperadmin") {
      // Privilege escalation: precisa confirmar senha do super atual.
      setConfirmSuper({ rowId, next: !current, error: null });
      return;
    }
    startTransition(async () => {
      const res = await updateClienteCell(
        rowId,
        key as EditableKey,
        !current,
      );
      if (!res.ok) {
        setSaveErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmSuperToggle(password: string) {
    if (!confirmSuper) return;
    const { rowId, next } = confirmSuper;
    startTransition(async () => {
      const res = await updateClienteCell(
        rowId,
        "isSuperadmin",
        next,
        password,
      );
      if (!res.ok) {
        setConfirmSuper({ rowId, next, error: res.error });
        return;
      }
      setConfirmSuper(null);
      router.refresh();
    });
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
            placeholder="Buscar por nome, e-mail, tenant..."
          />
          {isSuper && (
            <div className="inline-flex items-center gap-1.5">
              <div style={{ width: 220 }}>
                <SearchableSelect<ClienteRow, number>
                  items={rows}
                  value={clienteFilter}
                  onChange={setClienteFilter}
                  getKey={(c) => c.id}
                  getLabel={(c) =>
                    c.nome ?? c.email ?? `Cliente #${c.id}`
                  }
                  getSecondary={(c) => c.crmTenant ?? c.email ?? null}
                  matches={(c, q) => {
                    const norm = (s: string) =>
                      s
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/\p{Diacritic}/gu, "");
                    const haystack = norm(
                      [c.nome, c.email, c.crmTenant]
                        .map((v) => String(v ?? ""))
                        .join(" "),
                    );
                    return haystack.includes(norm(q));
                  }}
                  placeholder="Filtrar por cliente..."
                  searchPlaceholder="Buscar cliente..."
                  emptyLabel="Nenhum cliente."
                  width={320}
                />
              </div>
              {clienteFilter !== null && (
                <button
                  type="button"
                  onClick={() => setClienteFilter(null)}
                  title="Limpar filtro"
                  aria-label="Limpar filtro"
                  className="chip chip-mint text-[11px] px-2 py-0.5"
                  style={{ height: "26px" }}
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            allDefs={pickerDefs}
            hidden={hidden}
            onToggle={toggleHidden}
            onShowAll={showAllCols}
            onHideAll={() => persistHidden(new Set(visibleKeys))}
          />
          {isSuper && !embedded && (
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="chip chip-mint text-[12px] px-2.5 py-1 transition-colors whitespace-nowrap"
              style={{ height: "26px" }}
            >
              <span aria-hidden className="text-[11px]">＋</span>
              <span>Novo cliente</span>
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-editorial" ref={tableRef}>
          <thead>
            <tr>
              {orderedDefs.map((d) => {
                const isSorted = sortKey === d.key;
                const isOver = overKey === d.key;
                const isDragging = dragKey === d.key;
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
                      {SECRET_KEYS.has(d.key) && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColReveal(d.key);
                          }}
                          aria-label={
                            colReveal.has(d.key)
                              ? "Ocultar todos os tokens da coluna"
                              : "Ver todos os tokens da coluna"
                          }
                          title={
                            colReveal.has(d.key)
                              ? "Ocultar coluna"
                              : "Ver coluna inteira"
                          }
                          className="ml-1 inline-flex items-center transition-colors hover:text-[color:var(--mint-300)]"
                          style={{
                            color: colReveal.has(d.key)
                              ? "var(--mint-300)"
                              : "var(--fg-muted)",
                          }}
                        >
                          {colReveal.has(d.key) ? (
                            <IconEye size={14} />
                          ) : (
                            <IconEyeOff size={14} />
                          )}
                        </button>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan={orderedDefs.length}
                  className="text-center text-[color:var(--fg-subtle)] py-6"
                >
                  Nenhum cliente.
                </td>
              </tr>
            )}
            {pagedRows.map((c, rIdx) => {
              const rowSelected = selectedRows.has(c.id);
              return (
                <tr
                  key={c.id}
                  onDoubleClick={() => router.push(`/clientes/${c.id}/dados`)}
                  style={{
                    backgroundColor: rowSelected
                      ? "var(--ink-4)"
                      : undefined,
                    boxShadow: rowSelected
                      ? "inset 2px 0 0 var(--mint-300)"
                      : undefined,
                    cursor: "pointer",
                  }}
                >
                  {orderedDefs.map((d, cIdx) => {
                    const cell = renderCell(c, d.key);
                    const isCellSelected =
                      selected?.r === rIdx && selected?.c === cIdx;
                    const isEditing =
                      editing?.rowId === c.id && editing?.key === d.key;
                    const editable =
                      !d.readOnly && (!d.superOnly || isSuper);

                    const isSecret = SECRET_KEYS.has(d.key);
                    const secretValue = isSecret
                      ? (c[
                          d.key as
                            | "apiToken"
                            | "crmToken"
                            | "apiBaseUrl"
                            | "senha"
                        ] ?? null)
                      : null;
                    const secretRevealed = isSecret
                      ? isTokenRevealed(c.id, d.key)
                      : false;
                    const secretDisplay = isSecret
                      ? secretRevealed
                        ? fmtSecretRevealed(secretValue)
                        : fmtSecretMasked(secretValue)
                      : null;

                    const isBooleanToggle =
                      d.editKind === "boolean" && editable && isSuper;
                    const tdClass =
                      (cell.className ?? "") +
                      (d.align === "center" ? " text-center" : "");

                    return (
                      <td
                        key={d.key}
                        className={tdClass.trim() || undefined}
                        onClick={() => {
                          setSelected({ r: rIdx, c: cIdx });
                        }}
                        style={{
                          position: "relative",
                          outline: isCellSelected
                            ? "1px solid var(--mint-300)"
                            : undefined,
                          outlineOffset: isCellSelected ? "-1px" : undefined,
                          backgroundColor: isCellSelected
                            ? "var(--ink-4)"
                            : undefined,
                          cursor: editable ? "cell" : "default",
                          overflow: isEditing ? "visible" : undefined,
                        }}
                      >
                        {d.key === "saude" ? (
                          <HealthBadge
                            cliente={c}
                            isSuper={isSuper}
                            onOpen={() =>
                              router.push(`/clientes/${c.id}/dados`)
                            }
                          />
                        ) : d.key === "validacao" ? (
                          <ValidationBadge
                            cliente={c}
                            isSuper={isSuper}
                            onOpen={() => setValidacaoTarget(c)}
                          />
                        ) : d.key === "wa_status" ? (
                          <WaStatusBadge
                            status={waStatus[c.id]}
                            onRefresh={() => refetchWaStatus(c.id)}
                          />
                        ) : isEditing ? (
                          <CellEditor
                            def={d}
                            row={c}
                            pending={pending}
                            onCancel={cancelEdit}
                            onCommit={commitEdit}
                          />
                        ) : isBooleanToggle ? (
                          <BooleanToggle
                            value={
                              (c[d.key as "isActive" | "isSuperadmin"] ??
                                false) as boolean
                            }
                            pending={pending}
                            offIsAlert={d.key === "isActive"}
                            ariaLabel={`Toggle ${d.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBoolean(
                                c.id,
                                d.key,
                                (c[
                                  d.key as "isActive" | "isSuperadmin"
                                ] ?? false) as boolean,
                              );
                            }}
                          />
                        ) : (
                          <span
                            className={
                              d.key === "nome"
                                ? "flex items-center gap-1.5 group/cell w-full"
                                : "inline-flex items-center gap-1.5 group/cell"
                            }
                          >
                            {isSecret && secretValue && (
                              <SecretActions
                                revealed={secretRevealed}
                                value={secretValue}
                                onToggle={() => toggleRowReveal(c.id, d.key)}
                              />
                            )}
                            {isSecret ? (
                              <span
                                className="inline-block align-middle"
                                style={{
                                  maxWidth: "25ch",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={
                                  secretRevealed && secretValue
                                    ? secretValue
                                    : undefined
                                }
                              >
                                {secretDisplay}
                              </span>
                            ) : (
                              <>
                                {d.key === "email" && c.email && (
                                  <CopyButton value={c.email} />
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
                                    typeof cell.node === "string"
                                      ? cell.node
                                      : undefined
                                  }
                                >
                                  {cell.node}
                                </span>
                                {d.key === "nome" && (
                                  <Link
                                    href={`/clientes/${c.id}/dados`}
                                    prefetch={false}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Abrir cadastro de ${c.nome ?? `cliente #${c.id}`}`}
                                    title="Abrir cadastro do cliente"
                                    className="chip chip-mint text-[10.5px] px-1.5 py-0.5 transition-colors whitespace-nowrap shrink-0 ml-auto"
                                  >
                                    Abrir
                                  </Link>
                                )}
                              </>
                            )}
                            {isCellMissing(c, d.key) && (
                              <span
                                title="Informação faltando"
                                aria-label="Informação faltando"
                                className="inline-flex items-center"
                                style={{ color: "var(--amber-300)" }}
                              >
                                <IconInfo size={12} />
                              </span>
                            )}
                            {editable && !isBooleanToggle && (
                              <button
                                type="button"
                                aria-label={`Editar ${d.label}`}
                                title={`Editar ${d.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected({ r: rIdx, c: cIdx });
                                  startEdit(c.id, d.key);
                                }}
                                className="text-[13px] leading-none text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 transition-opacity"
                                style={{
                                  opacity: isCellSelected ? 1 : undefined,
                                }}
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
            })}
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
        <span>← ↑ → ↓ navegar</span>
        <span>· Enter editar célula</span>
        <span>· S selecionar linha</span>
        <span>· Esc limpar</span>
        {selectedRows.size > 0 && (
          <span style={{ color: "var(--mint-300)" }}>
            · {selectedRows.size} linha
            {selectedRows.size === 1 ? "" : "s"} selecionada
            {selectedRows.size === 1 ? "" : "s"}
          </span>
        )}
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

      <JsonValidationModal
        open={validacaoTarget !== null}
        title={
          validacaoTarget?.nome ?? `Cliente #${validacaoTarget?.id ?? ""}`
        }
        subtitle={
          validacaoTarget
            ? `id: ${validacaoTarget.id} · cliente está nas colunas reais (não jsonb) — sem auto-fix.`
            : undefined
        }
        fields={
          validacaoTarget
            ? buildClienteValidation(validacaoTarget, { isSuper })
            : []
        }
        onClose={() => setValidacaoTarget(null)}
      />

      <ClienteNovoModal open={novoOpen} onClose={() => setNovoOpen(false)} />
      <ClienteEditModal
        open={editTarget !== null}
        cliente={editTarget?.cliente ?? null}
        clientes={rows}
        isSuper={isSuper}
        onClose={() => setEditTarget(null)}
      />
      <PasswordConfirm
        open={confirmSuper !== null}
        title={
          confirmSuper?.next
            ? "Ativar superadmin neste cliente"
            : "Desativar superadmin deste cliente"
        }
        message={
          confirmSuper?.next
            ? "Alterar privilégio de superadmin requer a senha do super atual (suporte). Digite-a pra confirmar."
            : "Alterar privilégio de superadmin requer a senha do super atual (suporte). Digite-a pra confirmar a remoção."
        }
        pending={pending}
        errorMessage={confirmSuper?.error ?? null}
        onConfirm={confirmSuperToggle}
        onCancel={() => setConfirmSuper(null)}
      />
    </div>
  );
}

function WaStatusBadge({
  status,
  onRefresh,
}: {
  status:
    | {
        state:
          | "idle"
          | "loading"
          | "connected"
          | "disconnected"
          | "error"
          | "no-instance";
        label: string;
        errorDetail?: string;
      }
    | undefined;
  onRefresh: () => void;
}) {
  const s = status?.state ?? "idle";
  const colors: Record<typeof s, { bg: string; border: string; dot: string; text: string }> = {
    idle: {
      bg: "rgba(255,255,255,0.04)",
      border: "var(--b-soft)",
      dot: "var(--fg-disabled)",
      text: "var(--fg-disabled)",
    },
    loading: {
      bg: "var(--amber-bg)",
      border: "var(--amber-border)",
      dot: "var(--amber-300)",
      text: "var(--amber-300)",
    },
    connected: {
      bg: "var(--ink-3)",
      border: "var(--b-base)",
      dot: "var(--mint-300)",
      text: "var(--mint-300)",
    },
    disconnected: {
      bg: "var(--rose-bg)",
      border: "var(--rose-border)",
      dot: "var(--rose-300)",
      text: "var(--rose-300)",
    },
    error: {
      bg: "var(--amber-bg)",
      border: "var(--amber-border)",
      dot: "var(--amber-300)",
      text: "var(--amber-300)",
    },
    "no-instance": {
      bg: "rgba(255,255,255,0.04)",
      border: "var(--b-soft)",
      dot: "var(--fg-disabled)",
      text: "var(--fg-disabled)",
    },
  };
  const c = colors[s];
  const labels: Record<typeof s, string> = {
    idle: "verificar",
    loading: "checando",
    connected: "conectado",
    disconnected: "offline",
    error: "erro",
    "no-instance": "sem inst.",
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRefresh();
      }}
      title={
        status?.errorDetail
          ? `Status WhatsApp: ${status.label}\n\n${status.errorDetail}\n\nClick pra tentar novamente.`
          : `Status WhatsApp: ${status?.label ?? "—"} · click pra revalidar`
      }
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md hover:brightness-110"
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: c.dot }}
      />
      <span className="text-[11px]">{labels[s]}</span>
    </button>
  );
}

function ValidationBadge({
  cliente,
  isSuper,
  onOpen,
}: {
  cliente: ClienteRow;
  isSuper: boolean;
  onOpen: () => void;
}) {
  const fields = buildClienteValidation(cliente, { isSuper });
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
      <span className="text-[11px]">{ok ? "ok" : `${warns}`}</span>
    </button>
  );
}

function HealthBadge({
  cliente,
  isSuper,
  onOpen,
}: {
  cliente: ClienteRow;
  isSuper: boolean;
  onOpen: () => void;
}) {
  const pendentes = pendenciasFor(cliente, { isSuper });
  const ok = pendentes.length === 0;
  const labelOn = "completo";
  const labelOff = `${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"}`;
  const alertText = "var(--rose-300)";
  const alertDot = "var(--rose-300)";
  const alertBg = "var(--rose-bg)";
  const alertBorder = "var(--rose-border)";
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
          : `Pendentes: ${pendentes.map((p) => p.label).join(", ")}`
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
        style={{
          backgroundColor: ok ? "var(--mint-300)" : alertDot,
        }}
      />
      <span className="text-[11px]">{ok ? labelOn : labelOff}</span>
    </button>
  );
}


function CellEditor({
  def,
  row,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  row: ClienteRow;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | boolean | null) => void;
}) {
  // Senha: nunca pré-preenche com o hash existente. Sempre vazio.
  const initialText =
    def.editKind === "text"
      ? def.key === "senha"
        ? ""
        : (() => {
            const v = (row as unknown as Record<string, unknown>)[def.key];
            return v === null || v === undefined ? "" : String(v);
          })()
      : "";
  const initialBool = Boolean(
    (row as unknown as Record<string, unknown>)[def.key],
  );
  const [text, setText] = useState(initialText);
  const [bool, setBool] = useState(initialBool);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Senha usa input password (single-line). Outros texts usam textarea
  // que cresce vertical depois de 80ch de largura.
  const useTextarea = def.editKind === "text" && def.key !== "senha";

  useEffect(() => {
    if (def.editKind !== "text") return;
    if (useTextarea) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [def.editKind, useTextarea]);

  // Auto-resize vertical da textarea.
  useEffect(() => {
    if (!useTextarea) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, useTextarea]);

  if (def.editKind === "boolean") {
    return (
      <span className="inline-flex items-center gap-2">
        <select
          autoFocus
          value={bool ? "1" : "0"}
          onChange={(e) => setBool(e.target.value === "1")}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(bool);
            else if (e.key === "Escape") onCancel();
          }}
          disabled={pending}
          className="text-[12px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-base)",
            color: "var(--fg)",
          }}
        >
          <option value="1">{def.key === "isActive" ? "ativo" : "sim"}</option>
          <option value="0">
            {def.key === "isActive" ? "inativo" : "não"}
          </option>
        </select>
        <button
          type="button"
          onClick={() => onCommit(bool)}
          disabled={pending}
          className="text-[10px] text-[color:var(--mint-300)]"
          aria-label="Salvar"
        >
          ✓
        </button>
        <button
          type="button"
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

  // Largura dinâmica em ch — cresce com o texto, min 8 max 80.
  const dynamicWidth = `${Math.min(80, Math.max(8, text.length + 2))}ch`;

  return (
    <span
      className="inline-flex items-start gap-1"
      style={{ position: "relative", zIndex: 10 }}
    >
      {useTextarea ? (
        <textarea
          ref={textareaRef}
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
      ) : (
        <input
          ref={inputRef}
          type="password"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit(text);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          disabled={pending}
          placeholder="Nova senha (mín. 6 caracteres)"
          className="text-[12.5px] px-1.5 py-0.5 rounded min-w-0"
          style={{
            width: dynamicWidth,
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--mint-300)",
            color: "var(--fg)",
            outline: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}
        />
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onCommit(text)}
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
