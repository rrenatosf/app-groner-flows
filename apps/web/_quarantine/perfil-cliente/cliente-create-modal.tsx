"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Field, Toggle } from "@/components/form-field";
import { PasswordField } from "@/components/password-field";
import Link from "next/link";
import {
  createClienteAction,
  updateClienteSecaoAction,
  checkWhatsappStatusForClienteAction,
  fetchCrmLojasForClienteAction,
  fetchCrmUsuariosForClienteAction,
  fetchCrmUsuarioByCrmIdForClienteAction,
  fetchWhatsappInstanciasForClienteAction,
  fetchWhatsappWebhooksForClienteAction,
  importLojasFromCrmAction,
  importUsuariosFromCrmAction,
  setWhatsappWebhookForClienteAction,
  updateUsuarioFieldForClienteAction,
  type CrmLoja,
  type CrmUsuario,
  type WhatsappInstancia,
  type WhatsappStatusResult,
} from "./actions";
import {
  GRONER_WEBHOOK_DEFAULT,
  type WhatsappWebhook,
} from "@/lib/whatsapp/webhook";
import type { CrmStatusSlot, HorariosVendedor } from "@/lib/db/schema";
import { CrmStatusSlots } from "./crm-status-slots";
import {
  PRESET_COMERCIAL_8_18,
  PRESET_COMERCIAL_8_19_SAB,
  isHorariosVazio,
} from "@/lib/horarios";

type StagedUsuario = CrmUsuario & { horarios: HorariosVendedor };

type PresetOpcao = "8-18" | "8-19+sab" | "vazio";

const PRESETS: Record<PresetOpcao, HorariosVendedor> = {
  "8-18": PRESET_COMERCIAL_8_18,
  "8-19+sab": PRESET_COMERCIAL_8_19_SAB,
  vazio: {},
};

/** Pequeno bloco de chave/valor pro painel de status WhatsApp e
 *  outros displays curtos. */
function KV({
  k,
  v,
  numerics,
  highlight,
}: {
  k: string;
  v: string;
  numerics?: boolean;
  highlight?: "ok" | "warn" | null;
}) {
  const color =
    highlight === "ok"
      ? "var(--mint-300)"
      : highlight === "warn"
        ? "#fca5a5"
        : "var(--fg)";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--fg-subtle)]">
        {k}
      </dt>
      <dd
        className={`mt-1 ${numerics ? "numerics" : ""}`}
        style={{ color }}
      >
        {v}
      </dd>
    </div>
  );
}

function detectPreset(h: HorariosVendedor): PresetOpcao | "custom" {
  if (isHorariosVazio(h)) return "vazio";
  const json = JSON.stringify(h);
  if (json === JSON.stringify(PRESET_COMERCIAL_8_18)) return "8-18";
  if (json === JSON.stringify(PRESET_COMERCIAL_8_19_SAB)) return "8-19+sab";
  return "custom";
}

type Aba =
  | "identidade"
  | "whatsapp"
  | "crm"
  | "lojas"
  | "usuarios";

const ABAS: { key: Aba; label: string; requireCliente: boolean }[] = [
  { key: "identidade", label: "Identidade", requireCliente: false },
  { key: "whatsapp", label: "WhatsApp", requireCliente: true },
  { key: "crm", label: "CRM", requireCliente: true },
  { key: "lojas", label: "Lojas", requireCliente: true },
  { key: "usuarios", label: "Usuários", requireCliente: true },
];

/**
 * Heurística de pendências por aba — usada só pra exibir um bullet
 * discreto no header da aba indicando "tem coisa a fazer aqui".
 * Não detalha o quê — só sinaliza tendência.
 */
function pendingByAba(inicial: ClienteInicial | null | undefined): Record<Aba, boolean> {
  const c = inicial ?? null;
  const identidade = !c || !c.nome || !c.email;
  const whatsapp =
    !c?.apiBaseUrl || !c?.apiInstanciaNome || !c?.apiToken;
  const slots = c?.crmStatusColunas ?? [];
  const slotsFilled = slots.filter((s) => s && s.id && s.nome).length;
  const crm = !c?.crmOrigemId || slotsFilled < 9;
  const lojasReais = (c?.lojas ?? []).filter(
    (l) => typeof l.nome === "string" && l.nome.trim().length > 0,
  );
  const lojas = lojasReais.length === 0;
  const vendedoresReais = (c?.vendedores ?? []).filter(
    (v) => v.id > 0 && (v.email ?? "").trim().length > 0,
  );
  // Pendência de usuários: 0 reais OU algum vendedor sem horário.
  const algumSemHorario = (c?.vendedores ?? []).some((v) => {
    if (v.id <= 0) return false;
    const h = (v as unknown as { horarios?: Record<string, unknown> }).horarios;
    if (!h || typeof h !== "object") return true;
    return !Object.values(h).some((arr) => Array.isArray(arr) && arr.length > 0);
  });
  const usuarios = vendedoresReais.length === 0 || algumSemHorario;
  return { identidade, whatsapp, crm, lojas, usuarios };
}

export type ClienteInicial = {
  id: number;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  crmTenant: string | null;
  crmToken: string | null;
  apiBaseUrl: string | null;
  apiInstanciaNome: string | null;
  apiToken: string | null;
  crmOrigemId: string | null;
  /** Slots de status do CRM (9 fixos). null quando ainda não configurado. */
  crmStatusColunas?: CrmStatusSlot[] | null;
  /** Lojas já cadastradas no clientes.lojas. Se vazio, LojasTab auto-busca. */
  lojas?: Array<{ nome: string; crm_id: string; [k: string]: unknown }>;
  /** Vendedores já cadastrados em clientes.vendedores. */
  vendedores?: Array<{
    id: number;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    is_active: boolean;
  }>;
};

export function ClienteCreateModal({
  inicial,
  prevId,
  nextId,
}: {
  inicial?: ClienteInicial | null;
  prevId?: number | null;
  nextId?: number | null;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>("identidade");
  const [clienteId, setClienteId] = useState<number | null>(
    inicial?.id ?? null,
  );
  const [tenantNome, setTenantNome] = useState(inicial?.nome ?? "");
  // Re-sincroniza quando o pai re-renderiza com outro cliente (botão
  // prev/next mantém o modal aberto trocando só os dados via URL).
  // Padrão React 19: derived state via "store previous prop".
  const [prevIniciado, setPrevIniciado] = useState<number | null>(
    inicial?.id ?? null,
  );
  const incomingId = inicial?.id ?? null;
  if (incomingId !== prevIniciado) {
    setPrevIniciado(incomingId);
    setTenantNome(inicial?.nome ?? "");
    // Só reseta clienteId/aba quando troca DE um cliente PARA outro
    // (botão prev/next entre clientes existentes). Numa criação nova
    // (null → id), o IdentidadeTab.onCreated já avançou a aba/state
    // — não sobrescrever.
    const wasSwitch =
      prevIniciado !== null && incomingId !== null && prevIniciado !== incomingId;
    if (wasSwitch) {
      setClienteId(incomingId);
      setAba("identidade");
    } else if (incomingId !== null && clienteId === null) {
      // Caso raro: incoming id apareceu mas state local não foi setado
      // pelo onCreated (ex: hot reload). Sincroniza sem mexer na aba.
      setClienteId(incomingId);
    }
  }

  function goTo(id: number) {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("detail", String(id));
    router.replace(`${pathname}?${next.toString()}`);
  }

  function close() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("detail");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && prevId !== null && prevId !== undefined) {
        goTo(prevId);
      } else if (e.key === "ArrowRight" && nextId !== null && nextId !== undefined) {
        goTo(nextId);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 fade-in"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={close}
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
      />
      <div
        className="relative w-full max-w-[min(1720px,calc(100vw-2rem))] h-[calc(100vh-2rem)] flex flex-col rounded-2xl scale-in"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-7 pt-6 pb-4"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="label-eyebrow">
                {clienteId === null
                  ? "Novo cliente (tenant)"
                  : "Editando cliente"}
              </span>
              {(prevId !== undefined || nextId !== undefined) &&
                clienteId !== null && (
                  <span className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        prevId !== null && prevId !== undefined && goTo(prevId)
                      }
                      disabled={prevId === null || prevId === undefined}
                      className="size-5 rounded-md flex items-center justify-center text-[10px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
                      style={{ border: "1px solid var(--b-soft)" }}
                      title="Anterior (←)"
                      aria-label="Anterior"
                    >
                      ◂
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        nextId !== null && nextId !== undefined && goTo(nextId)
                      }
                      disabled={nextId === null || nextId === undefined}
                      className="size-5 rounded-md flex items-center justify-center text-[10px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
                      style={{ border: "1px solid var(--b-soft)" }}
                      title="Próximo (→)"
                      aria-label="Próximo"
                    >
                      ▸
                    </button>
                  </span>
                )}
            </div>
            <h2 className="serif text-[24px] leading-tight text-[color:var(--fg)]">
              {tenantNome || "Cadastrar nova loja"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="size-8 rounded-lg flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--ink-3)] transition-colors"
            aria-label="Fechar"
            style={{ border: "1px solid var(--b-soft)" }}
          >
            ✕
          </button>
        </header>

        {/* Tabs */}
        <nav
          className="flex items-stretch px-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          {(() => {
            const pend = pendingByAba(inicial);
            return ABAS.map((a) => {
              const disabled = a.requireCliente && clienteId === null;
              const active = aba === a.key;
              const hasPending = !disabled && pend[a.key];
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => !disabled && setAba(a.key)}
                  disabled={disabled}
                  className="px-4 py-3 text-[12.5px] transition-colors disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  style={{
                    color: active
                      ? "var(--mint-300)"
                      : disabled
                        ? "var(--fg-disabled)"
                        : "var(--fg-muted)",
                    borderBottom: active
                      ? "2px solid var(--mint-300)"
                      : "2px solid transparent",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span>{a.label}</span>
                  {hasPending && (
                    <span
                      aria-label="tem informação pendente"
                      className="size-1.5 rounded-full"
                      style={{
                        backgroundColor: "rgba(248,178,105,0.95)",
                        boxShadow: "0 0 6px rgba(248,178,105,0.55)",
                      }}
                    />
                  )}
                  {disabled && (
                    <span className="text-[10px] text-[color:var(--fg-disabled)]">
                      🔒
                    </span>
                  )}
                </button>
              );
            });
          })()}
        </nav>

        <div className="flex-1 overflow-auto px-7 py-6">
          {aba === "identidade" && (
            <IdentidadeTab
              clienteId={clienteId}
              inicial={inicial ?? null}
              onCreated={(id, nome) => {
                setClienteId(id);
                setTenantNome(nome);
                setAba("whatsapp");
                // Avança a URL pra ?detail=<id> — assim o page server
                // re-renderiza com `inicial` populado e as outras abas
                // têm acesso ao cliente recém criado. Sem isso, modal
                // ficava em ?detail=new com state inconsistente.
                const next = new URLSearchParams(
                  Array.from(params.entries()),
                );
                next.set("detail", String(id));
                router.replace(`${pathname}?${next.toString()}`);
              }}
              onClose={close}
            />
          )}
          {aba === "whatsapp" && clienteId !== null && (
            <WhatsappTab clienteId={clienteId} inicial={inicial ?? null} />
          )}
          {aba === "crm" && clienteId !== null && (
            <CrmTab
              clienteId={clienteId}
              crmOrigemId={inicial?.crmOrigemId ?? null}
              crmStatusColunas={inicial?.crmStatusColunas ?? null}
            />
          )}
          {aba === "lojas" && clienteId !== null && (
            <LojasTab
              clienteId={clienteId}
              jaCadastradas={(inicial?.lojas ?? []).filter(
                (l) =>
                  typeof l.nome === "string" && l.nome.trim().length > 0,
              )}
            />
          )}
          {aba === "usuarios" && clienteId !== null && (
            <UsuariosTab
              clienteId={clienteId}
              jaCadastrados={(inicial?.vendedores ?? []).filter(
                (v) => v.id > 0 && (v.email ?? "").trim().length > 0,
              )}
            />
          )}
        </div>

        {clienteId !== null && (
          <footer
            className="px-7 py-3 flex items-center justify-between gap-3 text-[11.5px]"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            <span className="text-[color:var(--fg-subtle)]">
              Cliente criado · ID #{clienteId}
            </span>
            <button
              type="button"
              onClick={() =>
                router.replace(`${pathname}?detail=${clienteId}`)
              }
              className="text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            >
              Abrir cadastro completo →
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function IdentidadeTab({
  clienteId,
  inicial,
  onCreated,
  onClose,
}: {
  clienteId: number | null;
  inicial: ClienteInicial | null;
  onCreated: (id: number, nome: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get("nome") ?? "");
    start(async () => {
      if (clienteId === null) {
        const r = await createClienteAction(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onCreated(r.id, nome);
      } else {
        fd.set("clienteId", String(clienteId));
        const r = await updateClienteSecaoAction(fd);
        if (!r.ok) setError(r.error);
        else {
          setMsg("Salvo.");
          router.refresh();
        }
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-[12.5px] text-[color:var(--fg-subtle)]">
        {clienteId === null
          ? "Salve essa aba primeiro para liberar as outras seções. O token do CRM é necessário para buscar lojas e usuários."
          : "Edite os dados do cliente. Senha não é exibida — preencha apenas se quiser trocar."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome do cliente"
          name="nome"
          required
          defaultValue={inicial?.nome ?? ""}
        />
        <Field
          label="E-mail (login admin)"
          name="email"
          type="email"
          required
          defaultValue={inicial?.email ?? ""}
        />
        <Field
          label="Telefone"
          name="telefone"
          defaultValue={inicial?.telefone ?? ""}
        />
        <Field
          label="Subdomínio (crm_tenant)"
          name="crmTenant"
          required
          hint="Apenas letras minúsculas. Ex.: looper → looper.groner.app"
          defaultValue={inicial?.crmTenant ?? ""}
        />
      </div>
      {clienteId === null && (
        <PasswordField
          label="Senha inicial"
          name="senha"
          hint="Mínimo 6 caracteres. Hash bcrypt. Cliente pode trocar depois."
        />
      )}
      <PasswordField
        label="Token CRM"
        name="crmToken"
        defaultValue={inicial?.crmToken ?? ""}
        hint="Bearer token do CRM Groner. Necessário para buscar lojas e usuários."
      />

      {error && (
        <p
          role="alert"
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      )}
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
            color: "var(--mint-300)",
          }}
        >
          {msg}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary disabled:opacity-50"
        >
          {pending
            ? "Salvando..."
            : clienteId === null
              ? "Salvar identidade"
              : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

type Campo = {
  name: string;
  label: string;
  type: "text" | "password";
  hint?: string;
  defaultValue?: string;
};

function SecaoSimples({
  clienteId,
  titulo,
  campos,
}: {
  clienteId: number;
  titulo: string;
  campos: Campo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("clienteId", String(clienteId));
    start(async () => {
      const r = await updateClienteSecaoAction(fd);
      if (r.ok) {
        setMsg({ ok: true, text: "Salvo." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h3 className="text-[14px] font-medium text-[color:var(--fg)]">{titulo}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map((c) =>
          c.type === "password" ? (
            <PasswordField
              key={c.name}
              label={c.label}
              name={c.name}
              hint={c.hint}
              defaultValue={c.defaultValue ?? ""}
            />
          ) : (
            <Field
              key={c.name}
              label={c.label}
              name={c.name}
              hint={c.hint}
              defaultValue={c.defaultValue ?? ""}
            />
          ),
        )}
      </div>
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: msg.ok
              ? "rgba(70,200,154,0.06)"
              : "rgba(248,113,113,0.06)",
            border: `1px solid ${msg.ok ? "rgba(70,200,154,0.32)" : "rgba(248,113,113,0.22)"}`,
            color: msg.ok ? "var(--mint-300)" : "#fca5a5",
          }}
        >
          {msg.text}
        </p>
      )}
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function CrmTab({
  clienteId,
  crmOrigemId,
  crmStatusColunas,
}: {
  clienteId: number;
  crmOrigemId: string | null;
  crmStatusColunas: CrmStatusSlot[] | null;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("clienteId", String(clienteId));
    startSave(async () => {
      const r = await updateClienteSecaoAction(fd);
      if (r.ok) {
        setMsg("Salvo.");
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* BOX 1 — Origem ID (campo único de identificação) */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Origem do lead
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            ID da origem usada pelo CRM para identificar de onde vem o
            lead (Marketing / SDR / IA).
          </p>
        </header>
        <Field
          label="Origem ID"
          name="crmOrigemId"
          defaultValue={crmOrigemId ?? ""}
        />
      </section>

      {/* BOX 2 — funis e etapas */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Funis e etapas do CRM
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            Cada slot tem nome (livre) + ID (do CRM) + slug (fixo, usado
            pelo backend). Use o helper "Buscar do CRM" pra preencher
            automaticamente.
          </p>
        </header>
        <CrmStatusSlots
          colunas={crmStatusColunas}
          clienteId={clienteId}
        />
      </section>

      {error && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      )}
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
            color: "var(--mint-300)",
          }}
        >
          {msg}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function WhatsappTab({
  clienteId,
  inicial,
}: {
  clienteId: number;
  inicial: ClienteInicial | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Aviso (amarelo queimado) — distinto de sucesso (mint). Usado pra
  // sinalizar "operação concluída mas resultado precisa de atenção"
  // (ex: 0 instâncias, instância desconectada).
  const [warn, setWarn] = useState<string | null>(null);
  const [instancias, setInstancias] = useState<WhatsappInstancia[] | null>(
    null,
  );
  const [pickedKey, setPickedKey] = useState(0);
  const [picked, setPicked] = useState<WhatsappInstancia | null>(null);

  function buscar() {
    setError(null);
    setMsg(null);
    setWarn(null);
    start(async () => {
      let r;
      try {
        r = await fetchWhatsappInstanciasForClienteAction(clienteId);
      } catch (e) {
        setError(
          `Falha ao chamar o servidor: ${e instanceof Error ? e.message : String(e)}`,
        );
        setInstancias([]);
        return;
      }
      if (!r.ok) {
        setError(r.error || "Erro desconhecido ao buscar instâncias.");
        setInstancias([]);
        return;
      }
      setInstancias(r.instancias);
      if (r.instancias.length === 0) {
        // Warning amarelo queimado (não erro, não sucesso) — destaca
        // que a busca rodou mas nada veio.
        setWarn(
          "Busca concluída — nenhuma instância encontrada pra este tenant. Verifique o subdomínio (crm_tenant) ou o token GRONER_ZAP_DEV_TOKEN.",
        );
      } else {
        setMsg(
          `${r.instancias.length} instância${r.instancias.length === 1 ? "" : "s"} carregada${r.instancias.length === 1 ? "" : "s"}. Click pra selecionar.`,
        );
      }
    });
  }

  function pick(inst: WhatsappInstancia) {
    setPicked(inst);
    setPickedKey((k) => k + 1);
  }

  // Verificar status: chama GET /instance/status no Uazapi com o token
  // gravado no cliente. Mostra resultado em painel inline.
  const [statusInfo, setStatusInfo] = useState<WhatsappStatusResult | null>(
    null,
  );
  const [statusPending, startStatus] = useTransition();
  function verificarStatus() {
    setError(null);
    setMsg(null);
    startStatus(async () => {
      const r = await checkWhatsappStatusForClienteAction(clienteId);
      setStatusInfo(r);
    });
  }

  // Webhook: lista config atual do Uazapi + permite aplicar padrão Groner.
  const [webhooks, setWebhooks] = useState<WhatsappWebhook[] | null>(null);
  const [webhookErr, setWebhookErr] = useState<string | null>(null);
  const [webhookPending, startWebhook] = useTransition();
  function verificarWebhook() {
    setWebhookErr(null);
    setMsg(null);
    startWebhook(async () => {
      const r = await fetchWhatsappWebhooksForClienteAction(clienteId);
      if (!r.ok) {
        setWebhookErr(r.error);
        setWebhooks(null);
        return;
      }
      setWebhooks(r.webhooks);
    });
  }
  function aplicarWebhookGroner() {
    setWebhookErr(null);
    setMsg(null);
    startWebhook(async () => {
      const r = await setWhatsappWebhookForClienteAction(
        clienteId,
        GRONER_WEBHOOK_DEFAULT,
      );
      if (!r.ok) {
        setWebhookErr(r.error);
        return;
      }
      // Re-puxa pra confirmar
      const fresh = await fetchWhatsappWebhooksForClienteAction(clienteId);
      if (fresh.ok) setWebhooks(fresh.webhooks);
      setMsg("Webhook configurado com o padrão Groner.");
    });
  }
  // Detecta se a config atual bate com o padrão Groner.
  function isGronerWebhook(w: WhatsappWebhook): boolean {
    if (w.url !== GRONER_WEBHOOK_DEFAULT.url) return false;
    if (!w.enabled) return false;
    const evs = (w.events ?? []).slice().sort();
    const expEvs = GRONER_WEBHOOK_DEFAULT.events.slice().sort();
    if (JSON.stringify(evs) !== JSON.stringify(expEvs)) return false;
    const ex = (w.excludeMessages ?? []).slice().sort();
    const expEx = (GRONER_WEBHOOK_DEFAULT.excludeMessages ?? [])
      .slice()
      .sort();
    if (JSON.stringify(ex) !== JSON.stringify(expEx)) return false;
    return true;
  }

  // Diff de atualização do cadastro WhatsApp (linha "Cadastrado
  // atualmente"). Compara campos do banco com o que o provedor
  // retornou na instância de mesmo nome canonical.
  type WhatsAppDiff = {
    instNome: string;
    fields: Array<{
      key: string;
      label: string;
      atual: string;
      novo: string;
      changed: boolean;
    }>;
    payload: { apiBaseUrl: string; apiInstanciaNome: string; apiToken: string; telefone: string };
  };
  const [whDiff, setWhDiff] = useState<WhatsAppDiff | null>(null);

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" && v.trim() === "") return "—";
    return String(v);
  }
  function fmtToken(v: unknown): string {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return "—";
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }

  function abrirDiffAtualizar() {
    setError(null);
    setMsg(null);
    const alvoNome = inicial?.apiInstanciaNome ?? "";
    if (!alvoNome) {
      setError("Sem instância cadastrada pra atualizar.");
      return;
    }
    start(async () => {
      const r = await fetchWhatsappInstanciasForClienteAction(clienteId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInstancias(r.instancias);
      const alvo = r.instancias.find((i) => i.nome === alvoNome);
      if (!alvo) {
        setError(`Instância "${alvoNome}" não encontrada no provedor.`);
        return;
      }
      const fields = [
        {
          key: "apiInstanciaNome",
          label: "Instância",
          atual: fmtVal(inicial?.apiInstanciaNome),
          novo: fmtVal(alvo.nome),
        },
        {
          key: "telefone",
          label: "Telefone",
          atual: fmtVal(inicial?.telefone),
          novo: fmtVal(alvo.telefone),
        },
        {
          key: "apiBaseUrl",
          label: "Base URL",
          atual: fmtVal(inicial?.apiBaseUrl),
          novo: fmtVal(alvo.baseUrl),
        },
        {
          key: "apiToken",
          label: "Token API",
          atual: fmtToken(inicial?.apiToken),
          novo: fmtToken(alvo.token),
        },
      ].map((f) => ({ ...f, changed: f.atual !== f.novo }));
      setWhDiff({
        instNome: alvo.nome || alvoNome,
        fields,
        payload: {
          apiBaseUrl: alvo.baseUrl ?? "",
          apiInstanciaNome: alvo.nome ?? "",
          apiToken: alvo.token ?? "",
          telefone: alvo.telefone ?? "",
        },
      });
    });
  }

  function confirmarWhDiff() {
    if (!whDiff) return;
    setError(null);
    setMsg(null);
    const fd = new FormData();
    fd.set("clienteId", String(clienteId));
    fd.set("apiBaseUrl", whDiff.payload.apiBaseUrl);
    fd.set("apiInstanciaNome", whDiff.payload.apiInstanciaNome);
    fd.set("apiToken", whDiff.payload.apiToken);
    fd.set("telefone", whDiff.payload.telefone);
    startSave(async () => {
      const r = await updateClienteSecaoAction(fd);
      if (!r.ok) setError(r.error);
      else {
        setMsg("Cadastro WhatsApp atualizado do provedor.");
        setWhDiff(null);
        router.refresh();
      }
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("clienteId", String(clienteId));
    startSave(async () => {
      const r = await updateClienteSecaoAction(fd);
      if (r.ok) {
        setMsg("Salvo.");
        // Force re-render do server component pra refletir os dados salvos.
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-medium text-[color:var(--fg)]">
          Integração WhatsApp
        </h3>
        <button
          type="button"
          onClick={buscar}
          disabled={pending}
          className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{
            backgroundColor: "rgba(70,200,154,0.10)",
            color: "var(--mint-200)",
            border: "1px solid rgba(70,200,154,0.32)",
          }}
        >
          {pending ? "Buscando..." : "Buscar instâncias"}
        </button>
      </div>

      {/* BOX 1 — leitura do banco. Surface ink-2 sutil + radius. */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Cadastrado atualmente
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            Snapshot do que está no banco. Click "↻ atualizar" pra
            sincronizar com o provedor.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="table-editorial">
            <thead>
              <tr>
                <th>Instância</th>
                <th>Telefone</th>
                <th>Base URL</th>
                <th>Token</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">
                  {fmtVal(inicial?.apiInstanciaNome)}
                </td>
                <td className="numerics text-[color:var(--fg-muted)]">
                  {fmtVal(inicial?.telefone)}
                </td>
                <td className="text-[color:var(--fg-muted)] max-w-xs truncate">
                  {fmtVal(inicial?.apiBaseUrl)}
                </td>
                <td className="numerics text-[color:var(--fg-muted)]">
                  {fmtToken(inicial?.apiToken)}
                </td>
                <td className="text-right">
                  <span className="inline-flex items-center gap-3 justify-end">
                    <button
                      type="button"
                      onClick={verificarStatus}
                      disabled={statusPending || !inicial?.apiToken}
                      className="text-[12px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-200)] disabled:opacity-40"
                      title="Chama GET /instance/status no Uazapi"
                    >
                      {statusPending ? "Verificando..." : "✓ status"}
                    </button>
                    <button
                      type="button"
                      onClick={abrirDiffAtualizar}
                      disabled={pending || saving || !inicial?.apiInstanciaNome}
                      className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)] disabled:opacity-40"
                      title="Re-puxa do provedor e mostra diff antes de salvar"
                    >
                      ↻ atualizar
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {statusInfo && (
          <div
            className="rounded-md p-4 space-y-2"
            style={{
              backgroundColor: "var(--ink-2)",
              border: statusInfo.ok
                ? "1px solid rgba(70,200,154,0.32)"
                : "1px solid rgba(248,113,113,0.32)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-medium text-[color:var(--fg)]">
                Status da instância
              </p>
              <button
                type="button"
                onClick={() => setStatusInfo(null)}
                className="text-[10.5px] text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
              >
                fechar ✕
              </button>
            </div>
            {!statusInfo.ok ? (
              <p
                className="text-[12px]"
                style={{ color: "#fca5a5" }}
              >
                {statusInfo.error}
              </p>
            ) : (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <KV
                  k="Conexão"
                  v={statusInfo.status ?? "—"}
                  highlight={
                    statusInfo.status === "connected"
                      ? "ok"
                      : statusInfo.status
                        ? "warn"
                        : null
                  }
                />
                <KV
                  k="Telefone"
                  v={statusInfo.owner ?? "—"}
                  numerics
                />
                <KV
                  k="Profile"
                  v={statusInfo.profileName ?? "—"}
                />
                <KV
                  k="Pair code"
                  v={statusInfo.paircode ?? "—"}
                  numerics
                />
              </dl>
            )}
          </div>
        )}
      </section>

      {/* BOX WEBHOOK — config Uazapi (GET /webhook). */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
              Webhook
            </h3>
            <p className="text-[12px] text-[color:var(--fg-subtle)]">
              Recebe eventos da instância (mensagens, status etc).
              Padrão Groner aponta pra{" "}
              <span className="numerics">webhooks.gronercrm.com.br</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={verificarWebhook}
              disabled={webhookPending || !inicial?.apiToken}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "var(--ink-2)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
            >
              {webhookPending ? "Verificando..." : "↻ Verificar"}
            </button>
            <button
              type="button"
              onClick={aplicarWebhookGroner}
              disabled={webhookPending || !inicial?.apiToken}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "rgba(70,200,154,0.10)",
                color: "var(--mint-200)",
                border: "1px solid rgba(70,200,154,0.32)",
              }}
            >
              Aplicar padrão Groner
            </button>
          </div>
        </header>

        {webhookErr && (
          <p
            className="text-[12px] rounded-md px-3 py-2"
            style={{
              backgroundColor: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.22)",
              color: "#fca5a5",
            }}
          >
            {webhookErr}
          </p>
        )}

        {webhooks && webhooks.length === 0 && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] italic">
            Nenhum webhook configurado nessa instância.
          </p>
        )}

        {webhooks && webhooks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table-editorial">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Eventos</th>
                  <th>Exclude</th>
                  <th className="text-center">Ativo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w, i) => {
                  const isGroner = isGronerWebhook(w);
                  return (
                    <tr key={w.id ?? `wh-${i}`}>
                      <td className="numerics text-[color:var(--fg-muted)] max-w-md truncate">
                        {w.url}
                      </td>
                      <td className="text-[color:var(--fg-muted)]">
                        {w.events.join(", ") || "—"}
                      </td>
                      <td className="text-[color:var(--fg-muted)] max-w-xs truncate">
                        {(w.excludeMessages ?? []).join(", ") || "—"}
                      </td>
                      <td className="text-center">
                        {w.enabled ? "sim" : "não"}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{
                              backgroundColor: isGroner
                                ? "var(--mint-300)"
                                : "rgba(248,178,105,0.95)",
                              boxShadow: isGroner
                                ? "0 0 6px rgba(70,200,154,0.55)"
                                : "0 0 6px rgba(248,178,105,0.55)",
                            }}
                          />
                          <span
                            className="text-[10.5px]"
                            style={{
                              color: isGroner
                                ? "var(--mint-300)"
                                : "var(--fg-muted)",
                            }}
                          >
                            {isGroner ? "padrão Groner" : "fora do padrão"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* BOX 2 — edição manual. Mesmo surface. Espaço entre boxes. */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Editar cadastro
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            Sem cadastro ainda? Click em "Buscar instâncias" — os
            campos preenchem automaticamente após selecionar uma.
          </p>
        </header>

      {instancias && instancias.length === 0 && (
        <p
          className="text-[12px] rounded-md px-3 py-2"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-muted)",
            border: "1px solid var(--b-soft)",
          }}
        >
          Nenhuma instância encontrada para este tenant.
        </p>
      )}

      {instancias && instancias.length > 0 && (
        <div
          className="rounded-md p-2"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
          }}
        >
          <p className="text-[11.5px] text-[color:var(--fg-muted)] px-2 py-1">
            {instancias.length === 1
              ? "1 instância encontrada. Click pra selecionar:"
              : `${instancias.length} instâncias encontradas. Selecione uma:`}
          </p>
          <ul className="divide-y" style={{ borderColor: "var(--b-soft)" }}>
            {instancias.map((i) => (
              <li key={i.id || i.nome}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  className="w-full text-left px-3 py-2 hover:bg-[color:var(--ink-2)] rounded transition-colors"
                  style={
                    picked?.id === i.id
                      ? { backgroundColor: "rgba(70,200,154,0.06)" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-[color:var(--fg)] truncate">
                      {i.displayName || i.nome || i.id}
                    </p>
                    {i.status && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            i.status === "connected"
                              ? "rgba(70,200,154,0.10)"
                              : "rgba(248,113,113,0.10)",
                          color:
                            i.status === "connected"
                              ? "var(--mint-300)"
                              : "#fca5a5",
                        }}
                      >
                        {i.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[color:var(--fg-subtle)] numerics mt-0.5">
                    {i.nome}
                  </p>
                  <p className="text-[11px] text-[color:var(--fg-subtle)] numerics">
                    tel {i.telefone ?? "—"} · {i.baseUrl ?? "—"} · #{i.id}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        key={pickedKey}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field
          label="Base URL"
          name="apiBaseUrl"
          defaultValue={picked?.baseUrl ?? inicial?.apiBaseUrl ?? ""}
        />
        <Field
          label="Instância"
          name="apiInstanciaNome"
          defaultValue={picked?.nome ?? inicial?.apiInstanciaNome ?? ""}
          hint="Nome canonical (formato <tenant>--<canal>) — vai pro banco."
        />
        <Field
          label="Telefone"
          name="telefone"
          defaultValue={
            picked ? (picked.telefone ?? "") : (inicial?.telefone ?? "")
          }
          hint="Vem direto do provedor da instância selecionada. Pode editar."
        />
        <PasswordField
          label="Token API"
          name="apiToken"
          defaultValue={picked?.token ?? inicial?.apiToken ?? ""}
          hint="Token decryptedToken da instância. Pode preencher manualmente."
        />
      </div>

      {error && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      )}
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
            color: "var(--mint-300)",
          }}
        >
          {msg}
        </p>
      )}
      {warn && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5 inline-flex items-start gap-2"
          style={{
            backgroundColor: "rgba(248,178,105,0.08)",
            border: "1px solid rgba(248,178,105,0.40)",
            color: "rgba(248,178,105,0.95)",
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full mt-1.5 shrink-0"
            style={{
              backgroundColor: "rgba(248,178,105,0.95)",
              boxShadow: "0 0 6px rgba(248,178,105,0.55)",
            }}
          />
          <span>{warn}</span>
        </p>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      </section>

      {whDiff && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => !saving && setWhDiff(null)}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
          />
          <div
            className="relative w-full max-w-[920px] max-h-[85vh] flex flex-col rounded-xl"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-base)",
              boxShadow: "var(--glow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4"
              style={{ borderBottom: "1px solid var(--b-soft)" }}
            >
              <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
                Atualizar do provedor
              </p>
              <h3 className="serif text-[20px] leading-tight text-[color:var(--fg)] mt-1">
                {whDiff.instNome}
              </h3>
              <p className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5">
                Comparando o cadastro atual com o que o Uazapi
                retornou agora. Confirme pra sobrescrever os campos.
              </p>
            </header>

            <div className="flex-1 overflow-auto px-5 py-4">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--b-soft)" }}>
                    <th className="text-left py-2 pr-3 w-36">Campo</th>
                    <th className="text-left py-2 pr-3">Atual</th>
                    <th className="text-left py-2 pr-3">Novo</th>
                    <th className="text-right py-2 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {whDiff.fields.map((f) => (
                    <tr
                      key={f.key}
                      style={{
                        borderBottom: "1px solid var(--b-soft)",
                        backgroundColor: f.changed
                          ? "rgba(70,200,154,0.04)"
                          : undefined,
                      }}
                    >
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.label}
                        <div className="text-[10px] text-[color:var(--fg-disabled)] numerics">
                          {f.key}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.atual}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg)]">
                        {f.novo}
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{
                              backgroundColor: f.changed
                                ? "var(--mint-300)"
                                : "var(--fg-disabled)",
                              boxShadow: f.changed
                                ? "0 0 6px rgba(70,200,154,0.55)"
                                : undefined,
                            }}
                          />
                          {f.changed ? (
                            <span
                              className="text-[10.5px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "rgba(70,200,154,0.10)",
                                color: "var(--mint-300)",
                              }}
                            >
                              muda
                            </span>
                          ) : (
                            <span className="text-[10.5px] text-[color:var(--fg-disabled)]">
                              igual
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer
              className="px-5 py-3 flex items-center justify-between gap-2"
              style={{ borderTop: "1px solid var(--b-soft)" }}
            >
              <span className="text-[11px] text-[color:var(--fg-subtle)]">
                {whDiff.fields.filter((f) => f.changed).length} campo(s)
                mudam
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWhDiff(null)}
                  disabled={saving}
                  className="btn-ghost text-[12.5px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarWhDiff}
                  disabled={
                    saving ||
                    whDiff.fields.filter((f) => f.changed).length === 0
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar atualização"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </form>
  );
}

function LojasTab({
  clienteId,
  jaCadastradas,
}: {
  clienteId: number;
  jaCadastradas: Array<{ nome: string; crm_id: string; [k: string]: unknown }>;
}) {
  const router = useRouter();
  const [lojas, setLojas] = useState<CrmLoja[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<CrmLoja[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Busca separada na tabela "Cadastradas atualmente" (banco).
  const [queryAtual, setQueryAtual] = useState("");
  const autoFetched = useRef(false);

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buscar() {
    setError(null);
    setMsg(null);
    setQuery("");
    start(async () => {
      const r = await fetchCrmLojasForClienteAction(clienteId);
      if (!r.ok) {
        setError(r.error);
        setLojas([]);
        return;
      }
      setLojas(r.lojas);
      // Default: nada selecionado. User marca o que quer importar.
      setSelecionadas(new Set());
    });
  }

  // Auto-busca se não houver lojas cadastradas ainda.
  useEffect(() => {
    if (autoFetched.current) return;
    autoFetched.current = true;
    if (jaCadastradas.length === 0) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = lojas.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      l.nome.toLowerCase().includes(q) ||
      (l.cnpj ?? "").toLowerCase().includes(q) ||
      (l.endereco ?? "").toLowerCase().includes(q) ||
      (l.telefone ?? "").toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q)
    );
  });

  function marcarVisiveis() {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      for (const l of filtradas) next.add(l.id);
      return next;
    });
  }
  function desmarcarTodas() {
    setSelecionadas(new Set());
  }

  /** Move as selecionadas para a área de staging (preview). Não grava ainda. */
  function importarParaStaging() {
    if (selecionadas.size === 0) return;
    setMsg(null);
    setError(null);
    const escolhidas = lojas.filter((l) => selecionadas.has(l.id));
    setStaged((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      for (const l of escolhidas) byId.set(l.id, l);
      return Array.from(byId.values());
    });
    setSelecionadas(new Set());
  }

  function removerStaged(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  // Diff de atualização: ao clicar ↻ na loja já cadastrada, calcula
  // a diferença campo a campo entre banco × CRM e abre modal pra
  // confirmar antes de salvar.
  type DiffField = {
    key: string;
    label: string;
    atual: string;
    novo: string;
    changed: boolean;
  };
  type DiffState = {
    crmId: string;
    nome: string;
    payload: Record<string, unknown>;
    fields: DiffField[];
  };
  const [diff, setDiff] = useState<DiffState | null>(null);

  const DIFF_LABELS: Array<[string, string]> = [
    ["nome", "Nome"],
    ["crm_id", "CRM ID"],
    ["cnpj", "CNPJ"],
    ["telefone", "Telefone"],
    ["endereco", "Endereço"],
    ["endereco_cep", "CEP"],
    ["endereco_rua", "Rua"],
    ["endereco_numero", "Número"],
    ["endereco_bairro", "Bairro"],
    ["endereco_cidade", "Endereço cidade"],
    ["endereco_estado", "Endereço estado"],
    ["endereco_complemento", "Complemento"],
  ];

  function fmt(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" && v.trim() === "") return "—";
    return String(v);
  }

  /** Compara CRM × banco e abre modal de confirmação. */
  function atualizarUma(crmId: string) {
    if (!crmId) return;
    setMsg(null);
    setError(null);
    startSave(async () => {
      let lista = lojas;
      if (lista.length === 0) {
        const r = await fetchCrmLojasForClienteAction(clienteId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setLojas(r.lojas);
        lista = r.lojas;
      }
      const alvo = lista.find((l) => l.id === crmId);
      if (!alvo) {
        setError(`Loja ${crmId} não encontrada no CRM.`);
        return;
      }
      const atualLoja = jaCadastradas.find(
        (l) => String(l.crm_id ?? "") === crmId,
      );
      const novo: Record<string, unknown> = {
        nome: alvo.nome,
        crm_id: alvo.id,
        cnpj: alvo.cnpj ?? null,
        telefone: alvo.telefone ?? null,
        endereco: alvo.endereco ?? null,
        endereco_cep: alvo.endereco_cep ?? null,
        endereco_rua: alvo.endereco_rua ?? null,
        endereco_bairro: alvo.endereco_bairro ?? null,
        endereco_cidade: alvo.endereco_cidade ?? null,
        endereco_estado: alvo.endereco_estado ?? null,
        endereco_numero: alvo.endereco_numero ?? null,
        endereco_complemento: alvo.endereco_complemento ?? null,
      };
      const fields: DiffField[] = DIFF_LABELS.map(([key, label]) => {
        const a = fmt(atualLoja?.[key]);
        const n = fmt(novo[key]);
        return { key, label, atual: a, novo: n, changed: a !== n };
      });
      // Inclui também os defaults de agenda no payload (sem comparar
      // — server preserva via emptyLoja).
      novo.area_atuacao = 0;
      novo.consumo_minimo = 0;
      setDiff({
        crmId,
        nome: alvo.nome || crmId,
        payload: novo,
        fields,
      });
    });
  }

  /** Confirma e grava o diff. */
  function confirmarDiff() {
    if (!diff) return;
    setMsg(null);
    setError(null);
    startSave(async () => {
      const r = await importLojasFromCrmAction(
        clienteId,
        JSON.stringify([diff.payload]),
      );
      if (!r.ok) setError(r.error);
      else {
        setMsg(`Loja ${diff.nome} atualizada do CRM.`);
        setDiff(null);
        router.refresh();
      }
    });
  }

  /** Persiste staged no banco. */
  function salvar() {
    if (staged.length === 0) return;
    setMsg(null);
    setError(null);
    // Envia o shape canonical completo da loja — server preserva
    // defaults agenda_* via emptyLoja(). Sem isso, loja_cidade,
    // endereco_*, etc viravam null no banco.
    const payload = staged.map((l) => ({
      nome: l.nome,
      crm_id: l.id,
      area_atuacao: 0,
      consumo_minimo: 0,
      cnpj: l.cnpj ?? null,
      telefone: l.telefone ?? null,
      endereco: l.endereco ?? null,
      endereco_cep: l.endereco_cep ?? null,
      endereco_rua: l.endereco_rua ?? null,
      endereco_bairro: l.endereco_bairro ?? null,
      endereco_cidade: l.endereco_cidade ?? null,
      endereco_estado: l.endereco_estado ?? null,
      endereco_numero: l.endereco_numero ?? null,
      endereco_complemento: l.endereco_complemento ?? null,
    }));
    startSave(async () => {
      const r = await importLojasFromCrmAction(
        clienteId,
        JSON.stringify(payload),
      );
      if (!r.ok) setError(r.error);
      else {
        setMsg(`${r.total} loja(s) salva(s).`);
        setStaged([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* BOX 1 — leitura: tabela do banco + ação Buscar do CRM */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
              Cadastradas atualmente{" "}
              <span className="text-[12px] text-[color:var(--fg-subtle)] font-normal">
                ({jaCadastradas.length}{" "}
                {jaCadastradas.length === 1 ? "loja" : "lojas"})
              </span>
            </h3>
            <p className="text-[12px] text-[color:var(--fg-subtle)]">
              Snapshot do banco. Click "↻ atualizar" pra sincronizar uma
              loja específica do CRM.
            </p>
          </div>
          <button
            type="button"
            onClick={buscar}
            disabled={pending}
            className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50 shrink-0"
            style={{
              backgroundColor: "rgba(70,200,154,0.10)",
              color: "var(--mint-200)",
              border: "1px solid rgba(70,200,154,0.32)",
            }}
          >
            {pending ? "Buscando..." : "Buscar do CRM"}
          </button>
        </header>

        {jaCadastradas.length > 0 ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="search"
                value={queryAtual}
                onChange={(e) => setQueryAtual(e.target.value)}
                placeholder="Filtrar nome, CRM ID, cidade, CNPJ ou endereço..."
                className="flex-1 min-w-[240px] rounded-md py-1.5 px-3 text-[12.5px]"
                style={{
                  backgroundColor: "var(--ink-2)",
                  color: "var(--fg)",
                  border: "1px solid var(--b-soft)",
                }}
              />
              {(() => {
                const q = queryAtual.trim().toLowerCase();
                const matched = q
                  ? jaCadastradas.filter((l) => {
                      const r = l as Record<string, unknown>;
                      return [
                        l.nome,
                        l.crm_id,
                        r.endereco_cidade,
                        l.endereco,
                        l.cnpj,
                      ]
                        .map((v) => String(v ?? "").toLowerCase())
                        .some((s) => s.includes(q));
                    })
                  : jaCadastradas;
                return (
                  <span className="text-[11px] text-[color:var(--fg-subtle)]">
                    {matched.length} de {jaCadastradas.length}
                  </span>
                );
              })()}
            </div>
            <div className="overflow-x-auto">
              <table className="table-editorial">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CRM ID</th>
                    <th>Cidade</th>
                    <th>Endereço</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {jaCadastradas
                    .filter((l) => {
                      const q = queryAtual.trim().toLowerCase();
                      if (!q) return true;
                      const r = l as Record<string, unknown>;
                      return [
                        l.nome,
                        l.crm_id,
                        r.endereco_cidade,
                        l.endereco,
                        l.cnpj,
                      ]
                        .map((v) => String(v ?? "").toLowerCase())
                        .some((s) => s.includes(q));
                    })
                    .map((l, i) => (
                      <tr key={`exist-${i}`}>
                        <td className="font-medium">
                          {String(l.nome ?? "") || "—"}
                        </td>
                        <td className="numerics text-[color:var(--fg-muted)]">
                          {String(l.crm_id ?? "") || "—"}
                        </td>
                        <td className="text-[color:var(--fg-muted)]">
                          {String(
                            (l as Record<string, unknown>).endereco_cidade ??
                              "—",
                          )}
                        </td>
                        <td className="text-[color:var(--fg-muted)] max-w-xs truncate">
                          {String(l.endereco ?? l.cnpj ?? "—")}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              atualizarUma(String(l.crm_id ?? ""))
                            }
                            disabled={saving || !l.crm_id}
                            className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)] disabled:opacity-40"
                            title="Re-puxa essa loja do CRM e sobrescreve com os dados atualizados"
                          >
                            ↻ atualizar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-[color:var(--fg-subtle)] italic py-2">
            Nenhuma loja cadastrada ainda. Use "Buscar do CRM" abaixo
            pra importar.
          </p>
        )}
      </section>

      {error && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      )}
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
            color: "var(--mint-300)",
          }}
        >
          {msg}
        </p>
      )}

      {/* BOX 2 — fluxo de importação do CRM (lista filtrada → staged → salvar) */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Importar do CRM
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            Selecione as lojas que quer importar, confira o preview e
            salve. O save mescla por CRM ID — não sobrescreve as outras.
          </p>
        </header>

        {lojas.length === 0 && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] italic">
            Click "Buscar do CRM" acima pra carregar as lojas disponíveis
            do tenant.
          </p>
        )}

      {lojas.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar por nome, CNPJ, endereço, telefone, ID..."
              className="flex-1 min-w-[240px] rounded-md py-1.5 px-3 text-[12.5px]"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            />
            <span className="text-[11px] text-[color:var(--fg-subtle)]">
              {filtradas.length} de {lojas.length} · {selecionadas.size} marcada
              {selecionadas.size === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={marcarVisiveis}
              className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            >
              marcar visíveis
            </button>
            <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
            <button
              type="button"
              onClick={desmarcarTodas}
              className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
            >
              limpar
            </button>
          </div>

          <div
            className="overflow-hidden rounded-md"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
              maxHeight: 400,
              overflowY: "auto",
            }}
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--b-soft)" }}>
                  <th className="text-left px-3 py-2 w-8" />
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">CNPJ</th>
                  <th className="text-left px-3 py-2">Endereço</th>
                  <th className="text-right px-3 py-2">CRM ID</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-[color:var(--fg-subtle)]"
                    >
                      Nenhuma loja corresponde à busca.
                    </td>
                  </tr>
                )}
                {filtradas.map((l, i) => (
                  <tr
                    key={l.id || `idx-${i}`}
                    style={{
                      borderBottom:
                        i < filtradas.length - 1
                          ? "1px solid var(--b-soft)"
                          : "none",
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selecionadas.has(l.id)}
                        onChange={() => toggle(l.id)}
                        className="size-4 accent-[color:var(--mint-400)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg)]">
                      {l.nome || "—"}
                    </td>
                    <td className="px-3 py-2 numerics text-[color:var(--fg-muted)]">
                      {l.cnpj ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg-muted)]">
                      {l.endereco ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right numerics text-[color:var(--fg-subtle)]">
                      #{l.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={importarParaStaging}
              disabled={selecionadas.size === 0}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--mint-300)",
                border: "1px solid var(--b-soft)",
              }}
            >
              Importar {selecionadas.size} loja
              {selecionadas.size === 1 ? "" : "s"} → preview
            </button>
          </div>
        </>
      )}

      {staged.length > 0 && (
        <div className="space-y-3 pt-2" style={{ borderTop: "1px dashed var(--b-soft)" }}>
          <div className="flex items-center justify-between gap-3 pt-3">
            <h4 className="text-[13px] font-medium text-[color:var(--mint-300)]">
              Lojas a salvar ({staged.length})
            </h4>
            <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
              Confira antes de salvar. Click ✕ para remover da lista.
            </span>
          </div>
          <div
            className="overflow-hidden rounded-md"
            style={{
              backgroundColor: "rgba(70,200,154,0.04)",
              border: "1px solid rgba(70,200,154,0.32)",
            }}
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(70,200,154,0.22)" }}>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">CNPJ</th>
                  <th className="text-left px-3 py-2">Endereço</th>
                  <th className="text-right px-3 py-2">CRM ID</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {staged.map((l, i) => (
                  <tr
                    key={l.id || `s-${i}`}
                    style={{
                      borderBottom:
                        i < staged.length - 1
                          ? "1px solid rgba(70,200,154,0.22)"
                          : "none",
                    }}
                  >
                    <td className="px-3 py-2 text-[color:var(--fg)]">
                      {l.nome || "—"}
                    </td>
                    <td className="px-3 py-2 numerics text-[color:var(--fg-muted)]">
                      {l.cnpj ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg-muted)]">
                      {l.endereco ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right numerics text-[color:var(--fg-subtle)]">
                      #{l.id}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removerStaged(l.id)}
                        className="text-[10.5px] text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

        {/* Footer com Salvar — sempre presente, dentro do Box 2 */}
        <div
          className="flex justify-end pt-3"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={salvar}
            disabled={saving || staged.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {saving
              ? "Salvando..."
              : staged.length === 0
                ? "Salvar (nada para salvar)"
                : `Salvar ${staged.length} loja${staged.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>

      {diff && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => !saving && setDiff(null)}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
          />
          <div
            className="relative w-full max-w-[1040px] max-h-[88vh] flex flex-col rounded-xl"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-base)",
              boxShadow: "var(--glow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4"
              style={{ borderBottom: "1px solid var(--b-soft)" }}
            >
              <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
                Atualizar do CRM
              </p>
              <h3 className="serif text-[20px] leading-tight text-[color:var(--fg)] mt-1">
                {diff.nome}
              </h3>
              <p className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5">
                Comparando o que está no banco com o que veio do CRM
                agora. Confirme pra sobrescrever só os campos marcados.
              </p>
            </header>

            <div className="flex-1 overflow-auto px-5 py-4">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--b-soft)" }}>
                    <th className="text-left py-2 pr-3 w-44">Campo</th>
                    <th className="text-left py-2 pr-3">Atual</th>
                    <th className="text-left py-2 pr-3">Novo</th>
                    <th className="text-right py-2 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.fields.map((f) => (
                    <tr
                      key={f.key}
                      style={{
                        borderBottom: "1px solid var(--b-soft)",
                        backgroundColor: f.changed
                          ? "rgba(70,200,154,0.04)"
                          : undefined,
                      }}
                    >
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.label}
                        <div className="text-[10px] text-[color:var(--fg-disabled)] numerics">
                          {f.key}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.atual}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg)]">
                        {f.novo}
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{
                              backgroundColor: f.changed
                                ? "var(--mint-300)"
                                : "var(--fg-disabled)",
                              boxShadow: f.changed
                                ? "0 0 6px rgba(70,200,154,0.55)"
                                : undefined,
                            }}
                          />
                          {f.changed ? (
                            <span
                              className="text-[10.5px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "rgba(70,200,154,0.10)",
                                color: "var(--mint-300)",
                              }}
                            >
                              muda
                            </span>
                          ) : (
                            <span className="text-[10.5px] text-[color:var(--fg-disabled)]">
                              igual
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-[color:var(--fg-subtle)] mt-3">
                Defaults de agenda (slots, turnos, antecedência etc.) não
                são tocados — server preserva o que já está no banco
                quando o CRM não envia esses campos.
              </p>
            </div>

            <footer
              className="px-5 py-3 flex items-center justify-between gap-2"
              style={{ borderTop: "1px solid var(--b-soft)" }}
            >
              <span className="text-[11px] text-[color:var(--fg-subtle)]">
                {diff.fields.filter((f) => f.changed).length} campo(s) mudam
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiff(null)}
                  disabled={saving}
                  className="btn-ghost text-[12.5px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarDiff}
                  disabled={
                    saving ||
                    diff.fields.filter((f) => f.changed).length === 0
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar atualização"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function UsuariosTab({
  clienteId,
  jaCadastrados,
}: {
  clienteId: number;
  jaCadastrados: Array<{
    id: number;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    is_active: boolean;
    crm_id?: string | null;
    horarios?: unknown;
  }>;
}) {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<CrmUsuario[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [staged, setStaged] = useState<StagedUsuario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [senhaPadrao, setSenhaPadrao] = useState("groner123");
  const [query, setQuery] = useState("");
  const [queryAtual, setQueryAtual] = useState("");
  const autoFetched = useRef(false);

  // Diff de atualização cross-tenant. Click ↻ na linha → fetch CRM
  // direto do usuário (GET /api/usuario/{crmId}) → mostra diff banco × CRM.
  type UDiffField = {
    key: string;
    label: string;
    atual: string;
    novo: string;
    changed: boolean;
  };
  type UDiffState = {
    usuarioId: number;
    crmId: string;
    nome: string;
    fields: UDiffField[];
    payload: { nome: string; email: string; telefone: string };
  };
  const [uDiff, setUDiff] = useState<UDiffState | null>(null);
  const [uDiffPending, startUDiff] = useTransition();

  function uFmt(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" && v.trim() === "") return "—";
    return String(v);
  }

  function abrirDiffUsuario(u: {
    id: number;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    crm_id?: string | null;
  }) {
    setError(null);
    setMsg(null);
    const cid = String(u.crm_id ?? "").trim();
    if (!cid) {
      setError("Vendedor sem crm_id — não dá pra atualizar do CRM.");
      return;
    }
    startUDiff(async () => {
      const r = await fetchCrmUsuarioByCrmIdForClienteAction(clienteId, cid);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const novo = {
        nome: r.usuario.nome ?? "",
        email: r.usuario.email ?? "",
        telefone: r.usuario.celular ?? "",
      };
      const fields: UDiffField[] = [
        {
          key: "nome",
          label: "Nome",
          atual: uFmt(u.nome),
          novo: uFmt(novo.nome),
          changed: uFmt(u.nome) !== uFmt(novo.nome),
        },
        {
          key: "email",
          label: "E-mail",
          atual: uFmt(u.email),
          novo: uFmt(novo.email),
          changed: uFmt(u.email) !== uFmt(novo.email),
        },
        {
          key: "telefone",
          label: "Telefone",
          atual: uFmt(u.telefone),
          novo: uFmt(novo.telefone),
          changed: uFmt(u.telefone) !== uFmt(novo.telefone),
        },
      ];
      setUDiff({
        usuarioId: u.id,
        crmId: cid,
        nome: u.nome ?? `Vendedor #${u.id}`,
        fields,
        payload: novo,
      });
    });
  }

  function confirmarUDiff() {
    if (!uDiff) return;
    setError(null);
    setMsg(null);
    startUDiff(async () => {
      const updates: Array<["nome" | "email" | "telefone", string]> = [];
      for (const f of uDiff.fields) {
        if (!f.changed) continue;
        const k = f.key as "nome" | "email" | "telefone";
        const v =
          k === "nome"
            ? uDiff.payload.nome
            : k === "email"
              ? uDiff.payload.email
              : uDiff.payload.telefone;
        updates.push([k, v]);
      }
      for (const [field, value] of updates) {
        const r = await updateUsuarioFieldForClienteAction(
          clienteId,
          uDiff.usuarioId,
          field,
          value,
        );
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      setMsg(`Vendedor "${uDiff.nome}" atualizado do CRM.`);
      setUDiff(null);
      router.refresh();
    });
  }

  function aplicarPresetTodos(p: PresetOpcao) {
    setStaged((prev) =>
      prev.map((s) => ({ ...s, horarios: PRESETS[p] })),
    );
  }
  function setPresetUm(id: number, p: PresetOpcao) {
    setStaged((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, horarios: PRESETS[p] } : s,
      ),
    );
  }

  function toggle(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buscar() {
    setError(null);
    setMsg(null);
    setQuery("");
    start(async () => {
      const r = await fetchCrmUsuariosForClienteAction(clienteId);
      if (!r.ok) {
        setError(r.error);
        setUsuarios([]);
        return;
      }
      setUsuarios(r.usuarios);
      setSelecionados(new Set());
    });
  }

  useEffect(() => {
    if (autoFetched.current) return;
    autoFetched.current = true;
    if (jaCadastrados.length === 0) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = usuarios.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.nome.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.celular ?? "").toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  function marcarVisiveis() {
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const u of filtrados) if (u.email) next.add(u.id);
      return next;
    });
  }
  function desmarcarTodos() {
    setSelecionados(new Set());
  }

  /** Move selecionados pro staging (preview). Não grava ainda.
   *  Default: comercial 8-18. User pode trocar antes de salvar. */
  function importarParaStaging() {
    if (selecionados.size === 0) return;
    setMsg(null);
    setError(null);
    const escolhidos = usuarios.filter((u) => selecionados.has(u.id));
    setStaged((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      for (const u of escolhidos) {
        if (!byId.has(u.id)) {
          byId.set(u.id, { ...u, horarios: PRESET_COMERCIAL_8_18 });
        }
      }
      return Array.from(byId.values());
    });
    setSelecionados(new Set());
  }

  function removerStaged(id: number) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  /** Persiste staged no banco. */
  function salvar() {
    if (staged.length === 0) return;
    if (senhaPadrao.length < 6) {
      setError("Senha padrão precisa ter ao menos 6 caracteres.");
      return;
    }
    setMsg(null);
    setError(null);
    startSave(async () => {
      const r = await importUsuariosFromCrmAction(
        clienteId,
        JSON.stringify(staged),
        senhaPadrao,
      );
      if (!r.ok) setError(r.error);
      else {
        setMsg(`${r.total} usuário(s) salvo(s) com a senha padrão.`);
        setStaged([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* BOX 1 — leitura: usuários do banco + ação Buscar do CRM */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
              Cadastrados atualmente{" "}
              <span className="text-[12px] text-[color:var(--fg-subtle)] font-normal">
                ({jaCadastrados.length}{" "}
                {jaCadastrados.length === 1 ? "vendedor" : "vendedores"})
              </span>
            </h3>
            <p className="text-[12px] text-[color:var(--fg-subtle)]">
              Vendedores cadastrados no banco para este tenant.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/usuarios"
              className="text-[12px] px-3 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-2)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
              title="Abre /usuarios pra cadastro completo (horários por intervalo, agenda Google, etc.)"
            >
              ↗ Tela completa
            </Link>
            <button
              type="button"
              onClick={buscar}
              disabled={pending}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "rgba(70,200,154,0.10)",
                color: "var(--mint-200)",
                border: "1px solid rgba(70,200,154,0.32)",
              }}
            >
              {pending ? "Buscando..." : "Buscar do CRM"}
            </button>
          </div>
        </header>

        {jaCadastrados.length > 0 ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="search"
                value={queryAtual}
                onChange={(e) => setQueryAtual(e.target.value)}
                placeholder="Filtrar nome, e-mail ou telefone..."
                className="flex-1 min-w-[240px] rounded-md py-1.5 px-3 text-[12.5px]"
                style={{
                  backgroundColor: "var(--ink-2)",
                  color: "var(--fg)",
                  border: "1px solid var(--b-soft)",
                }}
              />
              {(() => {
                const q = queryAtual.trim().toLowerCase();
                const matched = q
                  ? jaCadastrados.filter((u) =>
                      [u.nome, u.email, u.telefone]
                        .map((v) => String(v ?? "").toLowerCase())
                        .some((s) => s.includes(q)),
                    )
                  : jaCadastrados;
                return (
                  <span className="text-[11px] text-[color:var(--fg-subtle)]">
                    {matched.length} de {jaCadastrados.length}
                  </span>
                );
              })()}
            </div>
            <div className="overflow-x-auto">
              <table className="table-editorial">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Ativo</th>
                    <th>Horários</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {jaCadastrados
                    .filter((u) => {
                      const q = queryAtual.trim().toLowerCase();
                      if (!q) return true;
                      return [u.nome, u.email, u.telefone]
                        .map((v) => String(v ?? "").toLowerCase())
                        .some((s) => s.includes(q));
                    })
                    .map((u) => {
                      const h = u.horarios as
                        | Record<string, unknown>
                        | undefined;
                      const horariosOk =
                        !!h &&
                        typeof h === "object" &&
                        Object.values(h).some(
                          (arr) => Array.isArray(arr) && arr.length > 0,
                        );
                      return (
                        <tr key={`exist-${u.id}`}>
                          <td className="font-medium">{u.nome ?? "—"}</td>
                          <td className="text-[color:var(--fg-muted)]">
                            {u.email ?? "—"}
                          </td>
                          <td className="numerics text-[color:var(--fg-muted)]">
                            {u.telefone ?? "—"}
                          </td>
                          <td className="text-[color:var(--fg-muted)]">
                            {u.is_active ? "sim" : "não"}
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className="size-1.5 rounded-full"
                                style={{
                                  backgroundColor: horariosOk
                                    ? "var(--mint-300)"
                                    : "rgba(248,178,105,0.95)",
                                  boxShadow: horariosOk
                                    ? "0 0 6px rgba(70,200,154,0.55)"
                                    : "0 0 6px rgba(248,178,105,0.55)",
                                }}
                              />
                              <span
                                className="text-[11.5px]"
                                style={{
                                  color: horariosOk
                                    ? "var(--mint-300)"
                                    : "var(--fg-muted)",
                                }}
                              >
                                {horariosOk ? "ok" : "vazio"}
                              </span>
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="inline-flex items-center gap-3 justify-end">
                              <button
                                type="button"
                                onClick={() => abrirDiffUsuario(u)}
                                disabled={
                                  uDiffPending || !u.crm_id
                                }
                                className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)] disabled:opacity-40"
                                title="Re-puxa do CRM e mostra diff antes de salvar"
                              >
                                {uDiffPending ? "..." : "↻ atualizar"}
                              </button>
                              <Link
                                href={`/usuarios/${u.id}/editar`}
                                className="text-[12px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-200)]"
                                title="Abrir cadastro completo"
                              >
                                ↗ editar
                              </Link>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-[color:var(--fg-subtle)] italic py-2">
            Nenhum vendedor cadastrado ainda. Use "Buscar do CRM" pra
            importar.
          </p>
        )}
      </section>

      {error && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      )}
      {msg && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
            color: "var(--mint-300)",
          }}
        >
          {msg}
        </p>
      )}

      {/* BOX 2 — fluxo de importação do CRM (lista filtrada → staged → salvar) */}
      <section
        className="rounded-xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <header className="space-y-1">
          <h3 className="serif text-[22px] leading-tight text-[color:var(--fg)]">
            Importar do CRM
          </h3>
          <p className="text-[12px] text-[color:var(--fg-subtle)]">
            Selecione os vendedores que quer importar, escolha um preset
            de horário (ou aplique a todos) e salve com a senha padrão.
          </p>
        </header>

        {usuarios.length === 0 && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] italic">
            Click "Buscar do CRM" acima pra carregar os vendedores
            disponíveis do tenant.
          </p>
        )}

      {usuarios.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar por nome, e-mail, celular ou ID..."
              className="flex-1 min-w-[240px] rounded-md py-1.5 px-3 text-[12.5px]"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            />
            <span className="text-[11px] text-[color:var(--fg-subtle)]">
              {filtrados.length} de {usuarios.length} · {selecionados.size}{" "}
              marcado{selecionados.size === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={marcarVisiveis}
              className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            >
              marcar visíveis
            </button>
            <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
            <button
              type="button"
              onClick={desmarcarTodos}
              className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
            >
              limpar
            </button>
          </div>

          <div
            className="overflow-hidden rounded-md"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
              maxHeight: 400,
              overflowY: "auto",
            }}
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--b-soft)" }}>
                  <th className="text-left px-3 py-2 w-8" />
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">E-mail</th>
                  <th className="text-left px-3 py-2">Celular</th>
                  <th className="text-right px-3 py-2">CRM ID</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-[color:var(--fg-subtle)]"
                    >
                      Nenhum usuário corresponde à busca.
                    </td>
                  </tr>
                )}
                {filtrados.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom:
                        i < filtrados.length - 1
                          ? "1px solid var(--b-soft)"
                          : "none",
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selecionados.has(u.id)}
                        onChange={() => toggle(u.id)}
                        className="size-4 accent-[color:var(--mint-400)]"
                        disabled={!u.email}
                      />
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg)]">
                      {u.nome}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg-muted)]">
                      {u.email ?? (
                        <span className="text-[10.5px] italic">
                          sem e-mail (não importa)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 numerics text-[color:var(--fg-muted)]">
                      {u.celular ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right numerics text-[color:var(--fg-subtle)]">
                      #{u.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={importarParaStaging}
              disabled={selecionados.size === 0}
              className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--mint-300)",
                border: "1px solid var(--b-soft)",
              }}
            >
              Importar {selecionados.size} usuário
              {selecionados.size === 1 ? "" : "s"} → preview
            </button>
          </div>
        </>
      )}

      {staged.length > 0 && (
        <div className="space-y-3 pt-2" style={{ borderTop: "1px dashed var(--b-soft)" }}>
          <div className="flex items-center justify-between gap-3 pt-3 flex-wrap">
            <h4 className="text-[13px] font-medium text-[color:var(--mint-300)]">
              Usuários a salvar ({staged.length})
            </h4>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
                Aplicar preset a todos:
              </span>
              <button
                type="button"
                onClick={() => aplicarPresetTodos("8-18")}
                className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                title="Seg–sex 08:00–12:00 e 13:00–18:00"
              >
                comercial 8–18
              </button>
              <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
              <button
                type="button"
                onClick={() => aplicarPresetTodos("8-19+sab")}
                className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                title="Seg–sex 08:00–12:00 e 13:00–19:00 + sáb 08:00–12:00"
              >
                8–19 + sáb
              </button>
              <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
              <button
                type="button"
                onClick={() => aplicarPresetTodos("vazio")}
                className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
                title="Sem horário cadastrado (não receberá agendamento até preencher)"
              >
                limpar
              </button>
            </div>
          </div>
          <p className="text-[10.5px] text-[color:var(--fg-subtle)]">
            Click ✕ para remover. Pra customizar fino (intervalos por dia), edite o usuário em /usuarios depois.
          </p>
          <div
            className="overflow-hidden rounded-md"
            style={{
              backgroundColor: "rgba(70,200,154,0.04)",
              border: "1px solid rgba(70,200,154,0.32)",
            }}
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(70,200,154,0.22)" }}>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">E-mail</th>
                  <th className="text-left px-3 py-2">Celular</th>
                  <th className="text-left px-3 py-2">Horário</th>
                  <th className="text-right px-3 py-2">CRM ID</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {staged.map((u, i) => {
                  const preset = detectPreset(u.horarios);
                  return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom:
                        i < staged.length - 1
                          ? "1px solid rgba(70,200,154,0.22)"
                          : "none",
                    }}
                  >
                    <td className="px-3 py-2 text-[color:var(--fg)]">
                      {u.nome}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--fg-muted)]">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 numerics text-[color:var(--fg-muted)]">
                      {u.celular ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={preset === "custom" ? "8-18" : preset}
                        onChange={(e) =>
                          setPresetUm(u.id, e.target.value as PresetOpcao)
                        }
                        className="rounded-md py-1 px-2 text-[11.5px]"
                        style={{
                          backgroundColor: "var(--ink-3)",
                          color: "var(--fg)",
                          border: "1px solid var(--b-soft)",
                        }}
                      >
                        <option value="8-18">comercial 8–18</option>
                        <option value="8-19+sab">8–19 + sáb</option>
                        <option value="vazio">sem horário</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right numerics text-[color:var(--fg-subtle)]">
                      #{u.id}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removerStaged(u.id)}
                        className="text-[10.5px] text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="text-[12.5px] flex items-center gap-2 flex-wrap">
            <span className="text-[color:var(--fg-muted)]">
              Senha padrão para os importados:
            </span>
            <input
              type="text"
              value={senhaPadrao}
              onChange={(e) => setSenhaPadrao(e.target.value)}
              className="rounded-md py-1 px-2 text-[12px] numerics"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
                width: 160,
              }}
            />
            <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
              Mínimo 6 caracteres. Cada usuário pode trocar depois.
            </span>
          </label>
        </div>
      )}

        {/* Footer com Salvar — sempre presente, dentro do Box 2 */}
        <div
          className="flex justify-end pt-3"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={salvar}
            disabled={saving || staged.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {saving
              ? "Salvando..."
              : staged.length === 0
                ? "Salvar (nada para salvar)"
                : `Salvar ${staged.length} usuário${staged.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </section>

      {uDiff && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => !uDiffPending && setUDiff(null)}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
          />
          <div
            className="relative w-full max-w-[920px] max-h-[85vh] flex flex-col rounded-xl"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-base)",
              boxShadow: "var(--glow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4"
              style={{ borderBottom: "1px solid var(--b-soft)" }}
            >
              <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
                Atualizar do CRM
              </p>
              <h3 className="serif text-[20px] leading-tight text-[color:var(--fg)] mt-1">
                {uDiff.nome}
              </h3>
              <p className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5">
                Comparando o cadastro do banco com os dados atuais do
                CRM (id #{uDiff.crmId}).
              </p>
            </header>

            <div className="flex-1 overflow-auto px-5 py-4">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--b-soft)" }}>
                    <th className="text-left py-2 pr-3 w-32">Campo</th>
                    <th className="text-left py-2 pr-3">Atual</th>
                    <th className="text-left py-2 pr-3">Novo</th>
                    <th className="text-right py-2 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uDiff.fields.map((f) => (
                    <tr
                      key={f.key}
                      style={{
                        borderBottom: "1px solid var(--b-soft)",
                        backgroundColor: f.changed
                          ? "rgba(70,200,154,0.04)"
                          : undefined,
                      }}
                    >
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.label}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg-muted)]">
                        {f.atual}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--fg)]">
                        {f.novo}
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{
                              backgroundColor: f.changed
                                ? "var(--mint-300)"
                                : "var(--fg-disabled)",
                            }}
                          />
                          <span
                            className="text-[10.5px]"
                            style={{
                              color: f.changed
                                ? "var(--mint-300)"
                                : "var(--fg-disabled)",
                            }}
                          >
                            {f.changed ? "muda" : "igual"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer
              className="px-5 py-3 flex items-center justify-between gap-2"
              style={{ borderTop: "1px solid var(--b-soft)" }}
            >
              <span className="text-[11px] text-[color:var(--fg-subtle)]">
                {uDiff.fields.filter((f) => f.changed).length} campo(s)
                mudam
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUDiff(null)}
                  disabled={uDiffPending}
                  className="btn-ghost text-[12.5px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarUDiff}
                  disabled={
                    uDiffPending ||
                    uDiff.fields.filter((f) => f.changed).length === 0
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {uDiffPending ? "Salvando..." : "Confirmar atualização"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
