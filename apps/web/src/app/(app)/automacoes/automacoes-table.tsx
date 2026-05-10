"use client";

import {
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
  updateCatalogoAutomacaoCell,
  type EditableCatalogoKey,
} from "./actions";
import { AutomacaoEditModal } from "./automacao-edit-modal";
import { AutomacaoNovoModal } from "./automacao-novo-modal";
import {
  buildCatalogoValidation,
  pendenciasCatalogoFor,
  type CatalogoRow,
} from "./saude-catalogo";

/** Linha do catálogo. Mantém o nome legacy `AutomacaoRowFull` exportado
 *  pra compatibilidade com imports antigos durante a refatoração. */
export type AutomacaoRowFull = CatalogoRow;

type ColKey =
  | "nome"
  | "versao"
  | "descricao"
  | "baseUrl"
  | "n8nWorkflowId"
  | "isActive"
  | "template"
  | "saude"
  | "validacao";

type ColDef = {
  key: ColKey;
  label: string;
  align?: "left" | "center" | "right";
  readOnly?: boolean;
  editKind?: "text" | "boolean";
};

const COLUMNS: ColDef[] = [
  { key: "nome", label: "Nome", editKind: "text" },
  { key: "versao", label: "Versão", align: "center", editKind: "text" },
  { key: "descricao", label: "Descrição", editKind: "text" },
  { key: "baseUrl", label: "Base URL", editKind: "text" },
  { key: "n8nWorkflowId", label: "ID workflow n8n", editKind: "text" },
  { key: "isActive", label: "Ativo", align: "center", editKind: "boolean" },
  { key: "template", label: "Template", align: "center", readOnly: true },
  { key: "saude", label: "Saúde", align: "center", readOnly: true },
  {
    key: "validacao",
    label: "Validação JSON",
    align: "center",
    readOnly: true,
  },
];

const STORAGE_HIDDEN = "groner.automacoes_catalogo.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.automacoes_catalogo.page_size_v1";

/** Default visible. */
const DEFAULT_VISIBLE: ReadonlySet<ColKey> = new Set<ColKey>([
  "nome",
  "versao",
  "descricao",
  "n8nWorkflowId",
  "isActive",
  "template",
  "saude",
]);

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s.length === 0 ? "—" : s;
}

function valueFor(r: CatalogoRow, key: ColKey): unknown {
  if (key === "saude") return pendenciasCatalogoFor(r).length;
  if (key === "validacao") return 0;
  if (key === "template") {
    return Array.isArray(r.dadosConfiguracoesTemplate)
      ? r.dadosConfiguracoesTemplate.length
      : 0;
  }
  return (r as unknown as Record<string, unknown>)[key];
}

function isCellMissing(r: CatalogoRow, key: ColKey): boolean {
  if (
    key === "saude" ||
    key === "validacao" ||
    key === "isActive" ||
    key === "template"
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
  return String(av).localeCompare(String(bv), "pt-BR", {
    sensitivity: "base",
  });
}

export function AutomacoesTable({
  rows,
  canEdit,
}: {
  rows: CatalogoRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { showHealth, setShowHealth } = useHealthToggle("automacoes");
  const visibleDefs = useMemo(
    () =>
      COLUMNS.filter((c) =>
        showHealth ? true : c.key !== "saude" && c.key !== "validacao",
      ),
    [showHealth],
  );
  const visibleKeys = useMemo(
    () => visibleDefs.map((c) => c.key),
    [visibleDefs],
  );

  const defaultHidden = useMemo(
    () => new Set(visibleKeys.filter((k) => !DEFAULT_VISIBLE.has(k))),
    [visibleKeys],
  );

  const [hidden, setHidden] = useState<Set<ColKey>>(defaultHidden);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HIDDEN);
      if (!raw) {
        setHidden(defaultHidden);
        return;
      }
      const stored = JSON.parse(raw) as ColKey[];
      if (!Array.isArray(stored)) return;
      setHidden(new Set(stored.filter((k) => visibleKeys.includes(k))));
    } catch {
      setHidden(defaultHidden);
    }
  }, [visibleKeys, defaultHidden]);
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

  const [sortKey, setSortKey] = useState<ColKey>("nome");
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
  }, [sortedRows.length]);
  const pagedRows = useMemo(
    () => sortedRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [sortedRows, pageIndex, pageSize],
  );

  // Edit inline.
  const [editing, setEditing] = useState<{
    automacaoId: number;
    key: ColKey;
  } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    setEditing(null);
  }, [rows]);

  // Navegação por setas.
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(
    null,
  );
  useEffect(() => {
    setSelected(null);
  }, [rows]);

  function startEdit(automacaoId: number, key: ColKey) {
    setSaveErr(null);
    setEditing({ automacaoId, key });
  }
  function cancelEdit() {
    setEditing(null);
  }
  function commitEdit(value: string | boolean | null) {
    if (!editing) return;
    const { automacaoId, key } = editing;
    if (
      key === "template" ||
      key === "saude" ||
      key === "validacao"
    ) {
      setEditing(null);
      return;
    }
    const actionKey = key as EditableCatalogoKey;
    startTransition(async () => {
      const res = await updateCatalogoAutomacaoCell(
        automacaoId,
        actionKey,
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
  function toggleBoolean(automacaoId: number, current: boolean) {
    setSaveErr(null);
    startTransition(async () => {
      const res = await updateCatalogoAutomacaoCell(
        automacaoId,
        "isActive",
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
  const [editTarget, setEditTarget] = useState<CatalogoRow | null>(null);
  const [validacaoTarget, setValidacaoTarget] =
    useState<CatalogoRow | null>(null);

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

  function renderRow(r: CatalogoRow, rIdx: number) {
    return (
      <tr
        key={r.id}
        onDoubleClick={() => setEditTarget(r)}
        style={{ cursor: "default" }}
      >
        {orderedDefs.map((d, cIdx) => {
          const isEditing =
            editing?.automacaoId === r.id && editing?.key === d.key;
          const isCellSelected =
            selected?.r === rIdx && selected?.c === cIdx;
          const editable = canEdit && !d.readOnly;
          const isBoolToggle =
            d.editKind === "boolean" && editable && !isEditing;
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
              {d.key === "saude" ? (
                <HealthBadge
                  automacao={r}
                  onOpen={() => setEditTarget(r)}
                />
              ) : d.key === "validacao" ? (
                <ValidationBadgeAuto
                  automacao={r}
                  onOpen={() => setValidacaoTarget(r)}
                />
              ) : d.key === "template" ? (
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
                  title="Abrir template em modal"
                >
                  {Array.isArray(r.dadosConfiguracoesTemplate)
                    ? r.dadosConfiguracoesTemplate.length
                    : 0}{" "}
                  grupo
                  {Array.isArray(r.dadosConfiguracoesTemplate) &&
                  r.dadosConfiguracoesTemplate.length === 1
                    ? ""
                    : "s"}
                </button>
              ) : isBoolToggle ? (
                <BooleanToggle
                  value={!!r.isActive}
                  pending={pending}
                  offIsAlert
                  ariaLabel={d.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBoolean(r.id, !!r.isActive);
                  }}
                />
              ) : isEditing ? (
                <CellEditor
                  def={d}
                  row={r}
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
                  {d.key === "n8nWorkflowId" && r.baseUrl && r.n8nWorkflowId && (
                    <a
                      href={`${r.baseUrl.replace(/\/$/, "")}/workflow/${r.n8nWorkflowId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir workflow no n8n"
                      aria-label="Abrir workflow no n8n"
                      className="text-[11px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                    >
                      ↗
                    </a>
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
              <span>Nova automação</span>
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
                    className={
                      d.align === "center" ? "text-center" : undefined
                    }
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
            {pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan={orderedDefs.length}
                  className="text-center text-[color:var(--fg-subtle)] py-6"
                >
                  Nenhuma automação no catálogo.
                </td>
              </tr>
            )}
            {pagedRows.map((r, i) => renderRow(r, i))}
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
          {sortedRows.length} automaç
          {sortedRows.length === 1 ? "ão" : "ões"}
        </span>
        {pending && <span>· salvando…</span>}
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
        <AutomacaoNovoModal
          open={novoOpen}
          onClose={() => setNovoOpen(false)}
        />
      )}
      <AutomacaoEditModal
        open={editTarget !== null}
        target={editTarget}
        canEdit={canEdit}
        onClose={() => setEditTarget(null)}
      />
      <JsonValidationModal
        open={validacaoTarget !== null}
        title={`Automação: ${validacaoTarget?.nome ?? "(sem nome)"}`}
        subtitle={
          validacaoTarget
            ? `id ${validacaoTarget.id}${validacaoTarget.versao ? ` · v${validacaoTarget.versao}` : ""}`
            : undefined
        }
        fields={
          validacaoTarget ? buildCatalogoValidation(validacaoTarget) : []
        }
        onClose={() => setValidacaoTarget(null)}
      />
    </div>
  );
}

function HealthBadge({
  automacao,
  onOpen,
}: {
  automacao: CatalogoRow;
  onOpen: () => void;
}) {
  const pendentes = pendenciasCatalogoFor(automacao);
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
        style={{
          backgroundColor: ok ? "var(--mint-300)" : "var(--rose-300)",
        }}
      />
      <span className="text-[11px]">
        {ok
          ? "completo"
          : `${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"}`}
      </span>
    </button>
  );
}

function ValidationBadgeAuto({
  automacao,
  onOpen,
}: {
  automacao: CatalogoRow;
  onOpen: () => void;
}) {
  const fields = buildCatalogoValidation(automacao);
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
  row,
  pending,
  onCancel,
  onCommit,
}: {
  def: ColDef;
  row: CatalogoRow;
  pending: boolean;
  onCancel: () => void;
  onCommit: (value: string | boolean | null) => void;
}) {
  const initial = (() => {
    const v = (row as unknown as Record<string, unknown>)[def.key];
    if (v === null || v === undefined) return "";
    return String(v);
  })();
  const [text, setText] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  function commit() {
    onCommit(text);
  }

  const dynamicWidth = `${Math.min(80, Math.max(8, text.length + 2))}ch`;

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
          maxWidth: "min(80ch, 90vw)",
          minHeight: "26px",
          resize: "none",
          overflow: "hidden",
          lineHeight: "1.4",
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
