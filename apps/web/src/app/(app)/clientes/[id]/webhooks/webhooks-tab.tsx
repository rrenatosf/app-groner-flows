"use client";

/**
 * WebhooksTab — extraído de cliente-edit-modal.tsx (linhas 1027+).
 * Apenas mudança: vira componente standalone (não renderiza dentro de
 * um modal) e exporta como default. Lógica idêntica.
 */

import { useState, useTransition } from "react";
import {
  clearCrmStatusWebhookAction,
  deleteWhatsappWebhookForClienteAction,
  fetchWhatsappWebhooksForClienteAction,
  setWhatsappWebhookForClienteAction,
  fetchCrmStatusWithWebhookAction,
  fetchCrmWebhookGlobalAction,
  setCrmWebhookGlobalAction,
  type CrmStatusWithWebhook,
  type CrmWebhookGlobalEntry,
} from "@/server/actions/cliente-crm";
import { DEFAULT_CRM_WEBHOOK_GLOBAL_URL } from "@/lib/crm/slots";
import {
  GRONER_WEBHOOK_DEFAULT,
  type WhatsappWebhook,
} from "@/lib/whatsapp/webhook";

export function WebhooksTab({ clienteId }: { clienteId: number }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<CrmStatusWithWebhook[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Webhook global (mensagemRecebidaUrl).
  const [globalUrl, setGlobalUrl] = useState<string>(
    DEFAULT_CRM_WEBHOOK_GLOBAL_URL,
  );
  const [globalPending, startGlobalTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSavedOk, setGlobalSavedOk] = useState(false);

  // Eventos globais (lista de chaves *Url do /configuracaoWebhook).
  const [eventsPending, startEventsTransition] = useTransition();
  const [events, setEvents] = useState<CrmWebhookGlobalEntry[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  function loadEvents() {
    setEventsError(null);
    startEventsTransition(async () => {
      const res = await fetchCrmWebhookGlobalAction(clienteId);
      if (!res.ok) {
        setEventsError(res.error);
        setEvents(null);
        return;
      }
      setEvents(res.entries);
    });
  }

  function saveGlobal() {
    setGlobalError(null);
    setGlobalSavedOk(false);
    const trimmed = globalUrl.trim();
    if (!trimmed) {
      setGlobalError("URL não pode ser vazia.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setGlobalError("URL inválida.");
      return;
    }
    startGlobalTransition(async () => {
      const res = await setCrmWebhookGlobalAction(clienteId, trimmed);
      if (!res.ok) {
        setGlobalError(res.error);
        return;
      }
      setGlobalSavedOk(true);
      setTimeout(() => setGlobalSavedOk(false), 2500);
    });
  }

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await fetchCrmStatusWithWebhookAction(clienteId);
      if (!res.ok) {
        setError(res.error);
        setItems(null);
        return;
      }
      setItems(res.items);
      setTotal(res.total);
    });
  }

  // UazAPI WhatsApp webhook
  const [uazapiUrl, setUazapiUrl] = useState<string>(GRONER_WEBHOOK_DEFAULT.url);
  const [uazapiPending, startUazapiTransition] = useTransition();
  const [uazapiError, setUazapiError] = useState<string | null>(null);
  const [uazapiSavedOk, setUazapiSavedOk] = useState(false);
  const [uazapiList, setUazapiList] = useState<WhatsappWebhook[] | null>(null);
  const [uazapiListPending, startUazapiListTransition] = useTransition();
  const [uazapiListError, setUazapiListError] = useState<string | null>(null);

  function saveUazapi() {
    setUazapiError(null);
    setUazapiSavedOk(false);
    const trimmed = uazapiUrl.trim();
    if (!trimmed) {
      setUazapiError("URL não pode ser vazia.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUazapiError("URL inválida.");
      return;
    }
    startUazapiTransition(async () => {
      const res = await setWhatsappWebhookForClienteAction(clienteId, {
        ...GRONER_WEBHOOK_DEFAULT,
        url: trimmed,
      });
      if (!res.ok) {
        setUazapiError(res.error);
        return;
      }
      setUazapiSavedOk(true);
      setTimeout(() => setUazapiSavedOk(false), 2500);
      if (uazapiList !== null) loadUazapiList();
    });
  }

  function loadUazapiList() {
    setUazapiListError(null);
    startUazapiListTransition(async () => {
      const res = await fetchWhatsappWebhooksForClienteAction(clienteId);
      if (!res.ok) {
        setUazapiListError(res.error);
        setUazapiList(null);
        return;
      }
      setUazapiList(res.webhooks);
    });
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  function deleteUazapi(wh: WhatsappWebhook) {
    if (!wh.id) {
      setUazapiListError("Webhook sem ID — não dá pra apagar.");
      return;
    }
    if (
      !window.confirm(
        `Apagar este webhook da instância UazAPI?\n\nURL: ${wh.url}\nID: ${wh.id}`,
      )
    ) {
      return;
    }
    setDeletingId(wh.id);
    void (async () => {
      const res = await deleteWhatsappWebhookForClienteAction(clienteId, wh.id!);
      setDeletingId(null);
      if (!res.ok) {
        setUazapiListError(res.error);
        return;
      }
      loadUazapiList();
    })();
  }
  function toggleUazapiEnabled(wh: WhatsappWebhook) {
    if (!wh.id) {
      setUazapiListError(
        "Webhook sem ID — não dá pra atualizar sem recriar.",
      );
      return;
    }
    setTogglingId(wh.id);
    void (async () => {
      const res = await setWhatsappWebhookForClienteAction(clienteId, {
        ...wh,
        enabled: !wh.enabled,
      });
      setTogglingId(null);
      if (!res.ok) {
        setUazapiListError(res.error);
        return;
      }
      loadUazapiList();
    })();
  }

  const [removingId, setRemovingId] = useState<string | null>(null);
  function removeItem(statusId: string) {
    if (
      !window.confirm(
        "Apagar o webhook desta coluna? O CRM vai receber valor vazio.",
      )
    ) {
      return;
    }
    setRemovingId(statusId);
    void (async () => {
      const res = await clearCrmStatusWebhookAction(clienteId, statusId);
      setRemovingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => (prev ? prev.filter((it) => it.id !== statusId) : prev));
    })();
  }

  return (
    <div className="space-y-6">
      <WebhookSection
        title="Webhook global"
        subtitle="Endpoint POST /api/configuracaoWebhook · campo mensagemRecebidaUrl. Define a URL que o CRM dispara quando uma mensagem é recebida (qualquer coluna)."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            value={globalUrl}
            onChange={(e) => setGlobalUrl(e.target.value)}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            name="webhook-global-url"
            className="flex-1 min-w-[280px] rounded-md py-1.5 px-3 text-[12.5px] focus:outline-none"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          />
          <button
            type="button"
            onClick={saveGlobal}
            disabled={globalPending}
            className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            {globalPending ? "Configurando..." : "Configurar"}
          </button>
        </div>
        {globalError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {globalError}
          </div>
        )}
        {globalSavedOk && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-base)",
            }}
          >
            <span style={{ color: "var(--mint-300)" }}>✓</span> Webhook global configurado.
          </div>
        )}
      </WebhookSection>

      <WebhookSection
        title="Webhook UazAPI (instância WhatsApp)"
        subtitle="Endpoint POST /webhook da instância UazAPI. Configura events=[messages], excludeMessages=[wasSentByApi, fromMeYes, isGroupYes], enabled=true. Usa apiBaseUrl + apiToken do cliente."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            value={uazapiUrl}
            onChange={(e) => setUazapiUrl(e.target.value)}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            name="uazapi-webhook-url"
            className="flex-1 min-w-[280px] rounded-md py-1.5 px-3 text-[12.5px] focus:outline-none"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          />
          <button
            type="button"
            onClick={saveUazapi}
            disabled={uazapiPending}
            className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            {uazapiPending ? "Configurando..." : "Configurar"}
          </button>
        </div>
        {uazapiError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {uazapiError}
          </div>
        )}
        {uazapiSavedOk && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-base)",
            }}
          >
            <span style={{ color: "var(--mint-300)" }}>✓</span> Webhook UazAPI configurado.
          </div>
        )}
        <div className="pt-1 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadUazapiList}
            disabled={uazapiListPending}
            className="text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <span aria-hidden>{uazapiListPending ? "…" : "↻"}</span>
            <span>
              {uazapiListPending
                ? "Buscando..."
                : uazapiList === null
                  ? "Listar webhooks atuais"
                  : "Atualizar"}
            </span>
          </button>
          {uazapiList !== null && !uazapiListPending && (
            <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
              {uazapiList.length} webhook
              {uazapiList.length === 1 ? "" : "s"} ativo
              {uazapiList.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {uazapiListError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {uazapiListError}
          </div>
        )}
        {uazapiList !== null && uazapiList.length === 0 && !uazapiListPending && (
          <div
            className="rounded-md px-3 py-2 text-[12px] text-center italic"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg-subtle)",
              border: "1px dashed var(--b-soft)",
            }}
          >
            Nenhum webhook UazAPI configurado.
          </div>
        )}
        {uazapiList !== null && uazapiList.length > 0 && (
          <ul
            className="rounded-md divide-y"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {uazapiList.map((wh, i) => {
              const busy = !!wh.id && togglingId === wh.id;
              return (
                <li
                  key={wh.id ?? `wh-${i}`}
                  className="px-3 py-2 flex items-start gap-3"
                  style={{ borderBottom: "1px solid var(--b-soft)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[11px] mb-0.5 numerics"
                      style={{ color: "var(--mint-300)" }}
                      title={wh.url}
                    >
                      ↪ {wh.url || "(sem url)"}
                    </p>
                    <p className="text-[10.5px] text-[color:var(--fg-subtle)] numerics">
                      id: {wh.id ?? "—"} · events: [
                      {wh.events.join(", ") || "—"}]
                      {wh.excludeMessages &&
                        wh.excludeMessages.length > 0 && (
                          <> · exclude: [{wh.excludeMessages.join(", ")}]</>
                        )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteUazapi(wh)}
                    disabled={!wh.id || deletingId === wh.id}
                    title="Apagar este webhook da instância UazAPI"
                    className="text-[10.5px] px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--rose-bg)",
                      color: "var(--rose-300)",
                      border: "1px solid var(--rose-border)",
                    }}
                  >
                    <span aria-hidden>✕</span>
                    <span>
                      {deletingId === wh.id ? "Apagando…" : "Apagar"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleUazapiEnabled(wh)}
                    disabled={busy || !wh.id}
                    title={
                      !wh.id
                        ? "Sem ID — não dá pra alternar"
                        : wh.enabled
                          ? "Desativar webhook"
                          : "Ativar webhook"
                    }
                    className="text-[10.5px] px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--ink-3)",
                      color: wh.enabled ? "var(--mint-300)" : "var(--fg-muted)",
                      border: wh.enabled
                        ? "1px solid var(--b-base)"
                        : "1px solid var(--b-soft)",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: 22,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: wh.enabled
                          ? "var(--mint-700)"
                          : "rgba(255,255,255,0.10)",
                        border: `1px solid ${
                          wh.enabled
                            ? "var(--mint-600)"
                            : "rgba(255,255,255,0.18)"
                        }`,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          left: wh.enabled ? 11 : 1,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: wh.enabled
                            ? "var(--mint-100)"
                            : "rgba(255,255,255,0.65)",
                          transition: "left 160ms ease",
                        }}
                      />
                    </span>
                    <span>
                      {busy ? "…" : wh.enabled ? "Ativo" : "Inativo"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </WebhookSection>

      <WebhookSection
        title="Eventos globais com webhook"
        subtitle="Lista todos os campos *Url retornados por GET /api/configuracaoWebhook que estão preenchidos. Cada chave é um evento global (ex: mensagem recebida, mensagem enviada)."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadEvents}
            disabled={eventsPending}
            className="text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <span aria-hidden>{eventsPending ? "…" : "↻"}</span>
            <span>
              {eventsPending
                ? "Buscando..."
                : events === null
                  ? "Listar eventos com webhook"
                  : "Atualizar"}
            </span>
          </button>
          {events !== null && !eventsPending && (
            <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
              {events.length} evento{events.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {eventsError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {eventsError}
          </div>
        )}
        {events !== null && events.length === 0 && !eventsPending && !eventsError && (
          <div
            className="rounded-md px-3 py-2 text-[12px] text-center italic"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg-subtle)",
              border: "1px dashed var(--b-soft)",
            }}
          >
            Nenhum evento global com webhook configurado.
          </div>
        )}
        {events !== null && events.length > 0 && (
          <ul
            className="rounded-md divide-y"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {events.map((ev) => (
              <li
                key={ev.key}
                className="px-3 py-2 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--b-soft)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[color:var(--fg)] truncate numerics">
                    {ev.key}
                  </p>
                  <p
                    className="text-[11px] mt-0.5 truncate numerics"
                    style={{ color: "var(--mint-300)" }}
                    title={ev.url}
                  >
                    ↪ {ev.url}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WebhookSection>

      <WebhookSection
        title="Colunas com webhook"
        subtitle="Lista todas as colunas (status) do CRM deste cliente que têm campo WebhookUrl preenchido. Cada coluna requer um GET individual no CRM, então pode levar alguns segundos."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={load}
            disabled={pending}
            className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            <span aria-hidden>{pending ? "…" : "↻"}</span>
            <span>
              {pending
                ? "Buscando..."
                : items === null
                  ? "Listar colunas com webhook"
                  : "Atualizar"}
            </span>
          </button>
          {items !== null && !pending && (
            <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
              {items.length} de {total} colunas têm webhook
            </span>
          )}
        </div>

        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {error}
          </div>
        )}

        {items !== null && items.length === 0 && !pending && !error && (
          <div
            className="rounded-md px-3 py-3 text-[12.5px] text-center italic"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-subtle)",
              border: "1px dashed var(--b-soft)",
            }}
          >
            Nenhuma coluna com webhook configurado.
          </div>
        )}

        {items !== null && items.length > 0 && (
          <ul
            className="rounded-md divide-y"
            style={{
              backgroundColor: "var(--ink-3)",
              border: "1px solid var(--b-soft)",
              borderColor: "var(--b-soft)",
            }}
          >
            {items.map((it) => (
              <li
                key={it.id}
                className="px-3 py-2.5 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--b-soft)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[color:var(--fg)] truncate">
                    {it.nome || (
                      <em className="text-[color:var(--fg-subtle)]">sem nome</em>
                    )}
                  </p>
                  <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                    #{it.id}
                    {it.etapaNome ? ` · ${it.etapaNome}` : ""}
                  </p>
                  <p
                    className="text-[11px] mt-1 truncate numerics"
                    style={{ color: "var(--mint-300)" }}
                    title={it.webhookUrl}
                  >
                    ↪ {it.webhookUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  disabled={removingId === it.id}
                  title="Apagar webhook desta coluna"
                  className="text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--rose-bg)",
                    color: "var(--rose-300)",
                    border: "1px solid var(--rose-border)",
                  }}
                >
                  <span aria-hidden>✕</span>
                  <span>{removingId === it.id ? "Apagando…" : "Apagar"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </WebhookSection>
    </div>
  );
}

function WebhookSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h1
          className="text-[17px] font-bold tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11.5px] mt-0.5 text-[color:var(--fg-subtle)] leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      <div
        style={{
          height: 1,
          backgroundColor: "var(--b-base)",
        }}
      />
      <div
        className="rounded-lg p-4 space-y-2"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        {children}
      </div>
    </section>
  );
}
