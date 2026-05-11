"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clearCrmStatusWebhookAction,
  fetchCrmFunisAction,
  fetchCrmFunisForClienteAction,
  fetchCrmStatusWebhookByIdAction,
  setCrmStatusWebhookAction,
  validateCrmConnectionAction,
  validateCrmConnectionForClienteAction,
  type CrmStatus,
  type CrmConnectionInfo,
} from "@/server/actions/cliente-crm";
import {
  DEFAULT_CRM_WEBHOOK_URL,
  DEFAULT_CRM_WEBHOOK_QUALIFICACAO_URL,
  DESQUALIFICADO_SLUGS,
} from "@/lib/crm/slots";
import type { CrmStatusSlot, CrmStatusTipo } from "@/lib/db/schema";
import { useDebug } from "@/lib/debug/context";
import { SearchableSelect } from "@/components/data-table";

const dtChecked = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

function fmtCheckedAt(d: Date): string {
  return dtChecked.format(d);
}

type SlotDef = {
  slug: string;
  tipo: CrmStatusTipo;
  label: string;
};

type SlotValue = {
  id: string;
  nome: string;
  etapaId: string;
  etapaNome: string;
  notUsed: boolean;
};

const SLOT_DEFS: SlotDef[] = [
  { slug: "inicial", tipo: "inicial", label: "Status inicial" },
  { slug: "qualificado", tipo: "qualificacao", label: "Status qualificado" },
  ...DESQUALIFICADO_SLUGS.map(
    (d) =>
      ({
        slug: d.slug,
        tipo: "desqualificacao" as CrmStatusTipo,
        label: d.labelDefault,
      }) satisfies SlotDef,
  ),
];

export function CrmStatusSlots({
  colunas,
  clienteId,
}: {
  colunas: CrmStatusSlot[] | null;
  /** Quando presente, todas as queries CRM usam o token do cliente
   *  alvo (não da sessão). Necessário pra superadmin editando outro
   *  tenant via modal de Clientes. */
  clienteId?: number;
}) {
  // Wrappers que escolhem a action server certa: quando o componente
  // foi montado com clienteId (superadmin no modal), usa o fetch que
  // aceita id. Senão, usa a action self-tenant antiga.
  async function callValidate() {
    return clienteId
      ? validateCrmConnectionForClienteAction(clienteId)
      : validateCrmConnectionAction();
  }
  async function callFunis() {
    return clienteId
      ? fetchCrmFunisForClienteAction(clienteId)
      : fetchCrmFunisAction();
  }
  const arr = Array.isArray(colunas) ? colunas : [];

  // Estado dos slots
  const initialValues: Record<string, SlotValue> = useMemo(() => {
    const out: Record<string, SlotValue> = {};
    for (const def of SLOT_DEFS) {
      const found = arr.find((c) => c.slug === def.slug) ?? null;
      out[def.slug] = {
        id: found?.id ?? "",
        nome: found?.nome ?? "",
        etapaId: found?.etapa_id ?? "",
        etapaNome: found?.etapa_nome ?? "",
        notUsed: found?.not_used === true,
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<Record<string, SlotValue>>(initialValues);
  const debug = useDebug();

  // Mapa id → slug (qual slot já usa esse ID).
  const idToSlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of SLOT_DEFS) {
      const v = values[def.slug];
      if (v?.id) map.set(v.id, def.slug);
    }
    return map;
  }, [values]);

  // Status de configuração de cada slot. Slot "não utilizado" conta
  // como configurado (decisão consciente do cliente).
  const filledCount = SLOT_DEFS.filter((s) => {
    const v = values[s.slug];
    return !!(v?.id || v?.nome || v?.notUsed);
  }).length;
  const total = SLOT_DEFS.length;
  const pendingSlots = SLOT_DEFS.filter((s) => {
    const v = values[s.slug];
    return !(v?.id || v?.nome || v?.notUsed);
  });

  function clearSlot(slug: string) {
    debug.log("CrmStatusSlots.clear", { slug });
    setValues((p) => ({
      ...p,
      [slug]: {
        id: "",
        nome: "",
        etapaId: "",
        etapaNome: "",
        notUsed: false,
      },
    }));
  }

  function applyToSlot(slug: string, st: CrmStatus) {
    debug.log("CrmStatusSlots.apply", { slug, id: st.id, nome: st.nome });
    setValues((p) => ({
      ...p,
      [slug]: {
        id: st.id,
        nome: st.nome,
        etapaId: st.etapaId,
        etapaNome: st.etapaNome,
        notUsed: false,
      },
    }));
  }

  function toggleNotUsed(slug: string) {
    debug.log("CrmStatusSlots.toggleNotUsed", { slug });
    setValues((p) => {
      const cur = p[slug];
      const nextNotUsed = !cur.notUsed;
      return {
        ...p,
        [slug]: nextNotUsed
          ? {
              id: "",
              nome: "",
              etapaId: "",
              etapaNome: "",
              notUsed: true,
            }
          : { ...cur, notUsed: false },
      };
    });
  }

  // Validação CRM
  const [conn, setConn] = useState<CrmConnectionInfo | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [connPending, startConn] = useTransition();
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  function checkConnection() {
    setConnError(null);
    debug.log("CrmStatusSlots.checkConnection.start");
    startConn(async () => {
      const res = await callValidate();
      debug.log("CrmStatusSlots.checkConnection.result", res);
      setLastCheckedAt(new Date());
      if (!res.ok) {
        setConn(null);
        setConnError(res.error);
        return;
      }
      setConn(res.info);
    });
  }

  // Lista de colunas do CRM
  const [statusList, setStatusList] = useState<CrmStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listPending, startList] = useTransition();

  function ensureLoaded() {
    if (loaded || listPending) return;
    setListError(null);
    debug.log("CrmStatusSlots.fetchFunis.start");
    startList(async () => {
      const res = await callFunis();
      debug.log("CrmStatusSlots.fetchFunis.result", {
        ok: res.ok,
        count: res.ok ? res.statusList.length : null,
        error: res.ok ? null : res.error,
      });
      if (!res.ok) {
        setListError(res.error);
        return;
      }
      setStatusList(res.statusList);
      setLoaded(true);
    });
  }

  // Auto-carrega o listing pra resolver etapaNome dos slots já configurados.
  // E auto-valida a conexão CRM (token + tenant) ao montar — usuário não
  // precisa mais clicar "Validar". 1 GET cada. Não bloqueia render.
  useEffect(() => {
    ensureLoaded();
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando statusList chega, popular etapaNome dos slots já com id mas sem etapa.
  useEffect(() => {
    if (statusList.length === 0) return;
    setValues((prev) => {
      let mutated = false;
      const next = { ...prev };
      for (const def of SLOT_DEFS) {
        const v = prev[def.slug];
        if (!v?.id || v.etapaNome) continue;
        const match = statusList.find((s) => s.id === v.id);
        if (match?.etapaNome) {
          next[def.slug] = { ...v, etapaNome: match.etapaNome };
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [statusList]);

  function refreshList() {
    setListError(null);
    setLoaded(false);
    startList(async () => {
      const res = await callFunis();
      if (!res.ok) {
        setListError(res.error);
        return;
      }
      setStatusList(res.statusList);
      setLoaded(true);
    });
  }

  // Modal de configuração de webhook por slot.
  const [webhookSlug, setWebhookSlug] = useState<string | null>(null);
  function openWebhookModal(slug: string) {
    setWebhookSlug(slug);
  }
  function closeWebhookModal() {
    setWebhookSlug(null);
  }

  const initialSlug = SLOT_DEFS.find((s) => s.tipo === "inicial")?.slug ?? null;
  const qualifSlug =
    SLOT_DEFS.find((s) => s.tipo === "qualificacao")?.slug ?? null;
  const initialWebhookEnabled = !!(
    initialSlug && values[initialSlug]?.id && !values[initialSlug]?.notUsed
  );
  const qualifWebhookEnabled = !!(
    qualifSlug && values[qualifSlug]?.id && !values[qualifSlug]?.notUsed
  );
  const onCheckWebhookFn = clienteId
    ? (statusId: string) => fetchCrmStatusWebhookByIdAction(clienteId, statusId)
    : undefined;

  return (
    <div className="space-y-4">
      <ConnectionBadge
        info={conn}
        error={connError}
        pending={connPending}
        lastCheckedAt={lastCheckedAt}
        onCheck={checkConnection}
      />

      <ConfigSummary
        filled={filledCount}
        total={total}
        pendingLabels={pendingSlots.map((s) => s.label)}
      />

      <TipoSection
        title="Start inicial"
        tipo="inicial"
        onWebhook={
          clienteId && initialSlug
            ? () => openWebhookModal(initialSlug)
            : undefined
        }
        webhookEnabled={initialWebhookEnabled}
      >
        {SLOT_DEFS.filter((s) => s.tipo === "inicial").map((s) => (
          <SlotRow
            key={s.slug}
            def={s}
            value={values[s.slug]}
            onApply={(st) => applyToSlot(s.slug, st)}
            onClear={() => clearSlot(s.slug)}
            statusList={statusList}
            loaded={loaded}
            listPending={listPending}
            assignedIds={idToSlug}
            assignedLabels={Object.fromEntries(
              SLOT_DEFS.map((d) => [d.slug, d.label]),
            )}
            onRefreshList={refreshList}
            onCheckWebhook={onCheckWebhookFn}
            duplicateWith={
              values[s.slug].id &&
              [...idToSlug.entries()].some(
                ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
              )
                ? [...idToSlug.entries()].find(
                    ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
                  )?.[1]
                : undefined
            }
          />
        ))}
      </TipoSection>

      <TipoSection
        title="Qualificação"
        tipo="qualificacao"
        onWebhook={
          clienteId && qualifSlug
            ? () => openWebhookModal(qualifSlug)
            : undefined
        }
        webhookEnabled={qualifWebhookEnabled}
      >
        {SLOT_DEFS.filter((s) => s.tipo === "qualificacao").map((s) => (
          <SlotRow
            key={s.slug}
            def={s}
            value={values[s.slug]}
            onApply={(st) => applyToSlot(s.slug, st)}
            onClear={() => clearSlot(s.slug)}
            statusList={statusList}
            loaded={loaded}
            listPending={listPending}
            assignedIds={idToSlug}
            assignedLabels={Object.fromEntries(
              SLOT_DEFS.map((d) => [d.slug, d.label]),
            )}
            onRefreshList={refreshList}
            onCheckWebhook={onCheckWebhookFn}
            duplicateWith={
              values[s.slug].id &&
              [...idToSlug.entries()].some(
                ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
              )
                ? [...idToSlug.entries()].find(
                    ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
                  )?.[1]
                : undefined
            }
          />
        ))}
      </TipoSection>

      <TipoSection title="Desqualificação" tipo="desqualificacao">
        {SLOT_DEFS.filter((s) => s.tipo === "desqualificacao").map((s) => (
          <SlotRow
            key={s.slug}
            def={s}
            value={values[s.slug]}
            onApply={(st) => applyToSlot(s.slug, st)}
            onClear={() => clearSlot(s.slug)}
            statusList={statusList}
            loaded={loaded}
            listPending={listPending}
            assignedIds={idToSlug}
            assignedLabels={Object.fromEntries(
              SLOT_DEFS.map((d) => [d.slug, d.label]),
            )}
            onRefreshList={refreshList}
            onToggleNotUsed={() => toggleNotUsed(s.slug)}
            onWebhook={clienteId ? () => openWebhookModal(s.slug) : undefined}
            onCheckWebhook={onCheckWebhookFn}
            duplicateWith={
              values[s.slug].id &&
              [...idToSlug.entries()].some(
                ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
              )
                ? [...idToSlug.entries()].find(
                    ([id, sl]) => id === values[s.slug].id && sl !== s.slug,
                  )?.[1]
                : undefined
            }
          />
        ))}
      </TipoSection>

      {/* Hidden inputs para o form pai */}
      {SLOT_DEFS.map((def) => (
        <span key={def.slug} hidden>
          <input
            type="hidden"
            name={`id_${def.slug}`}
            value={values[def.slug].id}
            readOnly
          />
          <input
            type="hidden"
            name={`nome_${def.slug}`}
            value={values[def.slug].nome}
            readOnly
          />
          <input
            type="hidden"
            name={`etapa_id_${def.slug}`}
            value={values[def.slug].etapaId}
            readOnly
          />
          <input
            type="hidden"
            name={`etapa_nome_${def.slug}`}
            value={values[def.slug].etapaNome}
            readOnly
          />
          <input
            type="hidden"
            name={`notused_${def.slug}`}
            value={values[def.slug].notUsed ? "1" : "0"}
            readOnly
          />
        </span>
      ))}

      {webhookSlug && clienteId && (() => {
        const def = SLOT_DEFS.find((s) => s.slug === webhookSlug);
        const v = values[webhookSlug];
        if (!def || !v?.id) return null;
        return (
          <WebhookConfigModal
            slotLabel={def.label}
            statusId={v.id}
            statusNome={v.nome}
            clienteId={clienteId}
            defaultUrl={
              def.tipo === "inicial"
                ? DEFAULT_CRM_WEBHOOK_URL
                : def.tipo === "qualificacao"
                  ? DEFAULT_CRM_WEBHOOK_QUALIFICACAO_URL
                  : ""
            }
            onClose={closeWebhookModal}
          />
        );
      })()}
    </div>
  );
}

function ConnectionBadge({
  info,
  error,
  pending,
  lastCheckedAt,
  onCheck,
}: {
  info: CrmConnectionInfo | null;
  error: string | null;
  pending: boolean;
  lastCheckedAt: Date | null;
  onCheck: () => void;
}) {
  const state: "idle" | "ok" | "warn" | "error" = error
    ? "error"
    : info
      ? info.matchesTenant
        ? "ok"
        : "warn"
      : "idle";

  const palette: Record<typeof state, { bg: string; bd: string; fg: string; circle: string }> = {
    idle: {
      bg: "var(--ink-2)",
      bd: "var(--b-soft)",
      fg: "var(--fg-muted)",
      circle: "var(--ink-4)",
    },
    ok: {
      bg: "var(--ink-3)",
      bd: "var(--b-base)",
      fg: "var(--mint-300)",
      circle: "rgba(70,200,154,0.18)",
    },
    warn: {
      bg: "var(--amber-bg)",
      bd: "var(--amber-border)",
      fg: "var(--amber-300)",
      circle: "var(--amber-border)",
    },
    error: {
      bg: "var(--rose-bg)",
      bd: "var(--rose-border)",
      fg: "var(--rose-300)",
      circle: "var(--rose-border)",
    },
  };
  const c = palette[state];

  return (
    <div
      className="rounded-md p-3 flex items-start gap-3"
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.bd}`,
      }}
    >
      <div
        className="size-6 rounded-full flex items-center justify-center shrink-0 text-[12px]"
        style={{ backgroundColor: c.circle, color: c.fg }}
        aria-hidden
      >
        {state === "ok" ? "✓" : state === "warn" ? "!" : state === "error" ? "✕" : "•"}
      </div>
      <div className="flex-1 min-w-0">
        {state === "idle" && (
          <p className="text-[12.5px] text-[color:var(--fg-muted)]">
            Conexão com CRM não validada. Click em "Validar" para confirmar
            que o token e o subdomínio batem.
          </p>
        )}
        {state === "ok" && info && (
          <div className="text-[12.5px]" style={{ color: c.fg }}>
            <p>
              Conectado como <strong>{info.usuario || "—"}</strong>
              {info.email ? ` (${info.email})` : ""}
            </p>
            <p
              className="numerics text-[11px] mt-0.5"
              style={{ color: "var(--fg-subtle)" }}
            >
              tenant: <strong>{info.tenant}</strong>
              {info.tenantNome ? ` · ${info.tenantNome}` : ""}
              {info.loja ? ` · loja: ${info.loja}` : ""}
            </p>
          </div>
        )}
        {state === "warn" && info && (
          <div className="text-[12.5px]" style={{ color: c.fg }}>
            <p>
              Atenção: tenant do CRM (<strong>{info.tenant}</strong>) NÃO bate
              com `crm_tenant` configurado. Verifique se o token é mesmo deste
              cliente.
            </p>
          </div>
        )}
        {state === "error" && (
          <p className="text-[12.5px]" style={{ color: c.fg }}>
            {error}
          </p>
        )}
        {lastCheckedAt && (
          <p
            className="numerics text-[10.5px] mt-1.5"
            style={{ color: "var(--fg-subtle)" }}
            title={lastCheckedAt.toISOString()}
          >
            Última verificação: {fmtCheckedAt(lastCheckedAt)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onCheck}
        disabled={pending}
        className="text-[11.5px] px-2.5 py-1 rounded-md shrink-0 disabled:opacity-50"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg)",
          border: "1px solid var(--b-soft)",
        }}
      >
        {pending ? "Validando..." : info ? "Revalidar" : "Validar"}
      </button>
    </div>
  );
}

function ConfigSummary({
  filled,
  total,
  pendingLabels,
}: {
  filled: number;
  total: number;
  pendingLabels: string[];
}) {
  const pct = Math.round((filled / total) * 100);
  const allOk = filled === total;

  return (
    <div
      className="rounded-md p-3"
      style={{
        backgroundColor: "var(--ink-2)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[12.5px] font-medium text-[color:var(--fg)]">
          Configuração das colunas:{" "}
          <span className={allOk ? "text-[color:var(--mint-300)]" : "text-[color:var(--amber-300)]"}>
            {filled} de {total}
          </span>
        </p>
        <span className="text-[10.5px] text-[color:var(--fg-subtle)] numerics">
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--ink-3)" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: allOk
              ? "linear-gradient(90deg, var(--mint-500), var(--mint-300))"
              : "linear-gradient(90deg, #fbbf24, #fde047)",
          }}
        />
      </div>
      {pendingLabels.length > 0 && (
        <div className="mt-2.5 flex items-start gap-2 text-[11px]">
          <span className="text-[color:var(--fg-subtle)] uppercase tracking-wider shrink-0">
            Pendentes:
          </span>
          <ul className="flex flex-wrap gap-1">
            {pendingLabels.map((l) => (
              <li
                key={l}
                className="inline-flex items-center px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--amber-bg)",
                  color: "var(--amber-300)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TipoSection({
  title,
  tipo,
  children,
  onWebhook,
  webhookEnabled,
}: {
  title: string;
  tipo: CrmStatusTipo;
  children: React.ReactNode;
  /** Quando presente, renderiza botão "Webhook" no header. Só faz
   *  sentido em seções 1:1 (inicial, qualificacao). */
  onWebhook?: () => void;
  webhookEnabled?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div
        className="flex items-center justify-between mb-2.5 px-1 pb-2"
        style={{ borderBottom: "1px solid var(--b-base)" }}
      >
        <p
          className="text-[11.5px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg)" }}
        >
          {title}
        </p>
        <div className="flex items-center gap-2">
          {onWebhook && (
            <button
              type="button"
              onClick={onWebhook}
              disabled={!webhookEnabled}
              className="chip chip-mint text-[11px] px-2 py-1 disabled:opacity-50"
              title={
                webhookEnabled
                  ? "Configurar webhook desta coluna no CRM"
                  : "Configure a coluna primeiro para liberar webhook"
              }
            >
              <span aria-hidden>↪</span>
              <span>Webhook</span>
            </button>
          )}
          <span className="numerics text-[10px] text-[color:var(--fg-subtle)]">
            tipo: {tipo}
          </span>
        </div>
      </div>
      <div
        className={
          tipo === "desqualificacao"
            ? "flex flex-col gap-2"
            : "space-y-2"
        }
      >
        {children}
      </div>
    </div>
  );
}

function SlotRow({
  def,
  value,
  onApply,
  onClear,
  onToggleNotUsed,
  onWebhook,
  onCheckWebhook,
  statusList,
  loaded,
  listPending,
  assignedIds,
  assignedLabels,
  onRefreshList,
  duplicateWith,
}: {
  def: SlotDef;
  value: SlotValue;
  onApply: (st: CrmStatus) => void;
  onClear: () => void;
  /** Quando presente, renderiza um toggle "Não utilizar". Apenas slots
   *  de desqualificação devem expor esse controle. */
  onToggleNotUsed?: () => void;
  /** Quando presente, renderiza botão "Webhook" para configurar o
   *  WebhookUrl da coluna no CRM. Requer slot configurado e não-marcado
   *  como não-utilizado. */
  onWebhook?: () => void;
  onCheckWebhook?: (statusId: string) => Promise<
    | { ok: true; webhookUrl: string | null }
    | { ok: false; error: string }
  >;
  statusList: CrmStatus[];
  loaded: boolean;
  listPending: boolean;
  assignedIds: Map<string, string>;
  assignedLabels: Record<string, string>;
  onRefreshList: () => void;
  duplicateWith?: string;
}) {
  const filled = !!(value.id || value.nome);
  const isDup = !!duplicateWith;
  const notUsed = value.notUsed === true;
  type CheckState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "result"; webhookUrl: string | null }
    | { kind: "error"; error: string };
  const [checkState, setCheckState] = useState<CheckState>({ kind: "idle" });

  // Reseta resultado quando o slot muda (apply/clear) — evita ✓/✕
  // referente a statusId antigo persistindo na UI.
  useEffect(() => {
    setCheckState({ kind: "idle" });
  }, [value.id]);

  async function handleCheckWebhook() {
    if (!onCheckWebhook || !value.id) return;
    const requestedId = value.id;
    setCheckState({ kind: "loading" });
    const res = await onCheckWebhook(requestedId);
    // Stale guard: usuário pode ter trocado o slot durante o request.
    if (requestedId !== value.id) return;
    if (!res.ok) {
      setCheckState({ kind: "error", error: res.error });
      return;
    }
    setCheckState({ kind: "result", webhookUrl: res.webhookUrl });
  }

  return (
    <div
      className="rounded-md p-3"
      style={{
        backgroundColor: notUsed ? "var(--ink-3)" : "var(--ink-2)",
        border: isDup
          ? "1px solid var(--rose-border)"
          : "1px solid var(--b-soft)",
        opacity: notUsed ? 0.75 : 1,
      }}
    >
      <div
        className="flex items-center justify-between mb-2 gap-2 pb-2"
        style={{ borderBottom: "1px solid var(--b-soft)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="size-2 rounded-full shrink-0"
            style={{
              backgroundColor: notUsed
                ? "var(--fg-subtle)"
                : filled
                  ? isDup
                    ? "var(--rose-300)"
                    : "var(--mint-300)"
                  : "var(--amber-300)",
            }}
          />
          <p className="text-[12.5px] font-medium text-[color:var(--fg)] truncate">
            {def.label}
          </p>
          {filled && !notUsed && value.etapaNome && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0"
              style={{
                backgroundColor: "var(--ink-2)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
              title={`Etapa: ${value.etapaNome}`}
            >
              etapa: {value.etapaNome}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {filled && !notUsed && onCheckWebhook && (
            <button
              type="button"
              onClick={handleCheckWebhook}
              disabled={!value.id || checkState.kind === "loading"}
              aria-label="Verificar webhook"
              aria-busy={checkState.kind === "loading"}
              className="text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1.5 disabled:opacity-50 max-w-[360px]"
              style={{
                backgroundColor: "var(--ink-3)",
                color:
                  checkState.kind === "result" && checkState.webhookUrl
                    ? "var(--mint-300)"
                    : checkState.kind === "result"
                      ? "var(--rose-300)"
                      : checkState.kind === "error"
                        ? "var(--rose-300)"
                        : "var(--fg-muted)",
                border:
                  checkState.kind === "result" && !checkState.webhookUrl
                    ? "1px solid var(--rose-border)"
                    : "1px solid var(--b-soft)",
              }}
              title={
                !value.id
                  ? "Configure a coluna antes de verificar"
                  : checkState.kind === "result" && checkState.webhookUrl
                    ? `Webhook: ${checkState.webhookUrl}`
                    : checkState.kind === "result"
                      ? "Coluna não tem WebhookUrl configurado no CRM"
                      : checkState.kind === "error"
                        ? checkState.error
                        : "Consultar no CRM se esta coluna tem webhook"
              }
            >
              {checkState.kind === "loading" ? (
                <span aria-hidden>…</span>
              ) : checkState.kind === "result" && checkState.webhookUrl ? (
                <span aria-hidden>✓</span>
              ) : checkState.kind === "result" ? (
                <span aria-hidden>✕</span>
              ) : checkState.kind === "error" ? (
                <span aria-hidden>!</span>
              ) : (
                <span aria-hidden>?</span>
              )}
              <span className="truncate numerics">
                {checkState.kind === "loading"
                  ? "Verificando…"
                  : checkState.kind === "result" && checkState.webhookUrl
                    ? checkState.webhookUrl
                    : checkState.kind === "result"
                      ? "Sem webhook"
                      : checkState.kind === "error"
                        ? "Erro ao verificar"
                        : "Verificar webhook"}
              </span>
            </button>
          )}
          {filled && !notUsed && onWebhook && (
            <button
              type="button"
              onClick={onWebhook}
              className="chip chip-mint text-[11px] px-2 py-1"
              title="Configurar webhook desta coluna no CRM"
            >
              <span aria-hidden>↪</span>
              <span>Webhook</span>
            </button>
          )}
          {onToggleNotUsed && (
            <button
              type="button"
              onClick={onToggleNotUsed}
              className="text-[10.5px] px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: "var(--ink-3)",
                color: notUsed ? "var(--mint-300)" : "var(--fg-muted)",
                border: notUsed
                  ? "1px solid var(--b-base)"
                  : "1px solid var(--b-soft)",
              }}
              title={
                notUsed
                  ? "Marcado como não utilizado pelo cliente. Clique para reativar."
                  : "Marcar coluna como não utilizada (não conta como pendência)."
              }
            >
              <span
                aria-hidden
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 18,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: notUsed
                    ? "rgba(70,200,154,0.45)"
                    : "rgba(255,255,255,0.10)",
                  border: `1px solid ${
                    notUsed
                      ? "rgba(70,200,154,0.65)"
                      : "rgba(255,255,255,0.18)"
                  }`,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    left: notUsed ? 9 : 1,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: notUsed
                      ? "var(--mint-100)"
                      : "rgba(255,255,255,0.65)",
                    transition: "left 160ms ease",
                  }}
                />
              </span>
              <span>Não utilizar</span>
            </button>
          )}
          <span className="numerics text-[10.5px] text-[color:var(--fg-subtle)]">
            slug: {def.slug}
          </span>
        </div>
      </div>
      {isDup && !notUsed && (
        <p
          className="text-[11px] mb-2"
          style={{ color: "var(--rose-300)" }}
        >
          ⚠ ID duplicado — também atribuído ao slot "{duplicateWith}". Cada coluna do CRM só pode ser usada em um slot.
        </p>
      )}

      {notUsed ? (
        <div
          className="rounded-md px-3 py-2 text-[12px] italic"
          style={{
            backgroundColor: "var(--ink-2)",
            color: "var(--fg-subtle)",
            border: "1px dashed var(--b-soft)",
          }}
        >
          Não utilizado pelo cliente — slot preservado, não conta como pendência.
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <SearchableSelect
              items={statusList}
              value={value.id || null}
              onChange={(id) => {
                if (!id) {
                  onClear();
                  return;
                }
                const st = statusList.find((s) => s.id === id);
                if (st) onApply(st);
              }}
              getKey={(s) => s.id}
              getLabel={(s) => s.nome || `(${s.id})`}
              getSecondary={(s) => {
                const tagOther =
                  assignedIds.get(s.id) && assignedIds.get(s.id) !== def.slug
                    ? ` · já em "${
                        assignedLabels[assignedIds.get(s.id) ?? ""] ?? ""
                      }"`
                    : "";
                return `#${s.id}${
                  s.etapaNome ? ` · ${s.etapaNome}` : ""
                }${tagOther}`;
              }}
              matches={(s, q) =>
                s.nome.toLowerCase().includes(q) ||
                s.id.toLowerCase().includes(q) ||
                s.etapaNome.toLowerCase().includes(q)
              }
              placeholder={
                listPending && !loaded
                  ? "Carregando colunas do CRM…"
                  : !loaded
                    ? "Aguardando lista…"
                    : "Selecionar coluna do CRM…"
              }
              searchPlaceholder="Buscar coluna por nome, ID ou etapa…"
              emptyLabel="Nada encontrado."
              disabled={!loaded}
              width={420}
            />
            {filled && (
              <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics px-1">
                #{value.id}
                {value.etapaNome ? ` · ${value.etapaNome}` : ""}
              </p>
            )}
          </div>
          {filled && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11.5px] px-2 py-1 rounded-md shrink-0"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-subtle)",
                border: "1px solid var(--b-soft)",
              }}
              aria-label="Remover coluna"
              title="Remover esta coluna"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={onRefreshList}
            disabled={listPending}
            className="text-[11px] px-2 py-1 rounded-md shrink-0 disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-subtle)",
              border: "1px solid var(--b-soft)",
            }}
            title="Atualizar lista do CRM"
          >
            ↻
          </button>
        </div>
      )}
    </div>
  );
}

function PickerModal({
  targetSlug,
  targetLabel,
  statusList,
  loaded,
  pending,
  error,
  assignedIds,
  assignedLabels,
  onClose,
  onRefresh,
  onPick,
}: {
  targetSlug: string;
  targetLabel: string;
  statusList: CrmStatus[];
  loaded: boolean;
  pending: boolean;
  error: string | null;
  assignedIds: Map<string, string>;
  assignedLabels: Record<string, string>;
  onClose: () => void;
  onRefresh: () => void;
  onPick: (s: CrmStatus) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return statusList;
    return statusList.filter((s) => {
      return (
        s.nome.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.etapaNome.toLowerCase().includes(q)
      );
    });
  }, [statusList, query]);

  // Stop click propagation on modal
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(4,18,13,0.6)" }}
      />
      <div
        className="relative w-full max-w-[640px] rounded-xl flex flex-col max-h-[70vh]"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
              Selecionar coluna para
            </p>
            <p className="text-[14px] font-medium text-[color:var(--fg)]">
              {targetLabel}
              <span className="numerics text-[11px] text-[color:var(--fg-subtle)] ml-2">
                slug: {targetSlug}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            style={{ border: "1px solid var(--b-soft)" }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <svg
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--fg-subtle)" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar coluna por nome, ID ou etapa..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              name="crm-coluna-search"
              className="w-full rounded-[10px] py-[10px] pl-10 pr-12 text-[13px] focus:outline-none"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={pending}
              title="Atualizar lista"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md flex items-center justify-center text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] disabled:opacity-50"
              aria-label="Atualizar"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-3">
          {error && (
            <div
              className="mx-2 mb-2 px-3 py-2 text-[12px] rounded-md"
              style={{
                backgroundColor: "var(--rose-bg)",
                color: "var(--rose-300)",
                border: "1px solid var(--rose-border)",
              }}
            >
              {error}
            </div>
          )}
          {pending && !loaded && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              Buscando colunas no CRM...
            </div>
          )}
          {loaded && filtered.length === 0 && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              {query
                ? `Nenhuma coluna corresponde a "${query}".`
                : "CRM não retornou colunas."}
            </div>
          )}
          {loaded && filtered.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "var(--b-soft)" }}>
              {filtered.map((s) => {
                const assignedToOther =
                  assignedIds.has(s.id) && assignedIds.get(s.id) !== targetSlug;
                const assignedToHere =
                  assignedIds.has(s.id) && assignedIds.get(s.id) === targetSlug;
                const otherLabel = assignedToOther
                  ? assignedLabels[assignedIds.get(s.id) ?? ""] ?? ""
                  : "";
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={assignedToOther}
                      onClick={() => {
                        if (assignedToOther) return;
                        onPick(s);
                      }}
                      className="w-full text-left px-3 py-2 transition-colors disabled:cursor-not-allowed"
                      style={{
                        opacity: assignedToOther ? 0.55 : 1,
                        backgroundColor: assignedToHere
                          ? "var(--ink-4)"
                          : undefined,
                        borderLeft: assignedToHere
                          ? "2px solid var(--mint-300)"
                          : "2px solid transparent",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[color:var(--fg)] truncate">
                            {s.nome}
                          </p>
                          <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                            #{s.id} · {s.etapaNome}
                          </p>
                        </div>
                        {assignedToOther && (
                          <span
                            className="chip chip-red text-[10.5px] px-2 py-0.5 shrink-0"
                          >
                            já atribuído: {otherLabel}
                          </span>
                        )}
                        {assignedToHere && (
                          <span
                            className="chip chip-mint text-[10.5px] px-2 py-0.5 shrink-0"
                          >
                            atual deste slot
                          </span>
                        )}
                        {!assignedToOther && !assignedToHere && (
                          <span
                            className="text-[10.5px] px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: "var(--ink-3)",
                              color: "var(--fg-muted)",
                              border: "1px solid var(--b-soft)",
                            }}
                          >
                            {s.etapaNome}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer
          className="px-4 py-2.5 text-[11px] text-[color:var(--fg-subtle)] flex items-center justify-between"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <span>
            {loaded ? `${filtered.length} de ${statusList.length}` : "—"}
          </span>
          <span className="numerics">ESC fecha</span>
        </footer>
      </div>
    </div>
  );
}

function WebhookConfigModal({
  slotLabel,
  statusId,
  statusNome,
  clienteId,
  defaultUrl,
  onClose,
}: {
  slotLabel: string;
  statusId: string;
  statusNome: string;
  clienteId: number;
  defaultUrl: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    setError(null);
    setSuccess(false);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("URL não pode ser vazia.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setError("URL inválida.");
      return;
    }
    startTransition(async () => {
      const res = await setCrmStatusWebhookAction(clienteId, statusId, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setTimeout(onClose, 900);
    });
  }

  function clearWebhook() {
    if (
      !window.confirm(
        "Apagar o webhook desta coluna? O CRM vai receber valor vazio.",
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await clearCrmStatusWebhookAction(clienteId, statusId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl("");
      setSuccess(true);
      setTimeout(onClose, 900);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(4,18,13,0.6)" }}
      />
      <div
        className="relative w-full max-w-[560px] rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="px-4 py-3 flex items-start justify-between gap-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
              Configurar webhook na coluna do CRM
            </p>
            <p className="text-[14px] font-medium text-[color:var(--fg)] truncate">
              {slotLabel}
              <span className="numerics text-[11px] text-[color:var(--fg-subtle)] ml-2">
                #{statusId}
                {statusNome ? ` · ${statusNome}` : ""}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] shrink-0"
            style={{ border: "1px solid var(--b-soft)" }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="px-4 py-4 space-y-3">
          <p className="text-[12.5px] text-[color:var(--fg-muted)]">
            Vai ser feito um <strong>PUT</strong> em{" "}
            <code className="text-[11px] text-[color:var(--mint-300)]">
              /api/statusProjeto/{statusId}
            </code>{" "}
            do CRM do cliente, definindo o campo{" "}
            <code className="text-[11px] text-[color:var(--mint-300)]">
              WebhookUrl
            </code>
            . Confirme a URL antes de aplicar.
          </p>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              URL do webhook
            </span>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              name="webhook-url"
              className="mt-1 w-full rounded-[10px] py-[10px] px-3 text-[13px] focus:outline-none"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </label>

          {error && (
            <div
              className="px-3 py-2 text-[12px] rounded-md"
              style={{
                backgroundColor: "var(--rose-bg)",
                color: "var(--rose-300)",
                border: "1px solid var(--rose-border)",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="px-3 py-2 text-[12px] rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-base)",
              }}
            >
              <span style={{ color: "var(--mint-300)" }}>✓</span> Webhook configurado.
            </div>
          )}
        </div>

        <footer
          className="px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={clearWebhook}
            disabled={pending}
            className="chip chip-red text-[12px] px-3 py-1.5 disabled:opacity-50 inline-flex items-center gap-1.5"
            title="Apagar webhook desta coluna (envia valor vazio ao CRM)"
          >
            <span aria-hidden>✕</span>
            <span>Apagar webhook</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || success}
              className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? "Configurando..." : success ? "OK" : "Confirmar"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
