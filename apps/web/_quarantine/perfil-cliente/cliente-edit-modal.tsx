"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { CrmStatusSlot, Loja } from "@/lib/db/schema";
import { Field } from "@/components/form-field";
import { PasswordField } from "@/components/password-field";
import { SaveButton } from "@/components/save-button";
import {
  saveClienteAction,
  fetchWhatsappInstanciasAction,
  type WhatsappInstancia,
} from "./actions";
import { CrmStatusSlots } from "./crm-status-slots";
import { LojasSection } from "./lojas/lojas-section";

type Cliente = {
  id: number;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  crmTenant: string | null;
  apiBaseUrl: string | null;
  apiInstanciaNome: string | null;
  apiToken: string | null;
  crmToken: string | null;
  crmOrigemId: string | null;
  crmStatusColunas: CrmStatusSlot[] | null;
  isSuperadmin: boolean;
  lojas: Loja[];
};

function WhatsappInstanciasButton({
  viewerIsSuperadmin,
  onClick,
}: {
  viewerIsSuperadmin: boolean;
  onClick: () => void;
}) {
  if (!viewerIsSuperadmin) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] px-3 py-1 rounded-md"
      style={{
        backgroundColor: "var(--ink-3)",
        color: "var(--mint-300)",
        border: "1px solid var(--b-soft)",
      }}
    >
      Buscar instâncias
    </button>
  );
}

export function ClienteEditModal({
  cliente,
  viewerIsSuperadmin,
}: {
  cliente: Cliente;
  viewerIsSuperadmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Picker de instância WhatsApp
  const [apiPick, setApiPick] = useState<WhatsappInstancia | null>(null);
  const [zapOpen, setZapOpen] = useState(false);

  function close() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("detail");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="relative w-full max-w-[960px] max-h-[92vh] flex flex-col rounded-2xl scale-in"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-7 pt-6 pb-5"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow mb-1.5">Cliente</div>
            <h2 className="serif text-[24px] leading-tight text-[color:var(--fg)]">
              {cliente.nome ?? `Cliente #${cliente.id}`}
            </h2>
            <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1.5 numerics">
              tenant: {cliente.crmTenant ?? "—"}
            </p>
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

        <div className="flex-1 overflow-auto px-7 py-6 space-y-6">
          <form action={saveClienteAction} className="space-y-6">
            <Group title="Identidade">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" name="nome" defaultValue={cliente.nome} />
                <Field label="E-mail" name="email" type="email" defaultValue={cliente.email} />
                <Field label="Telefone" name="telefone" defaultValue={cliente.telefone} />
                <Field
                  label="Subdomínio (crm_tenant)"
                  name="crmTenant"
                  defaultValue={cliente.crmTenant}
                  hint="Usado no login. Ex.: looper → looper.api.groner.app"
                />
              </div>
            </Group>

            <Group
              title="Integração WhatsApp"
              actions={
                <WhatsappInstanciasButton
                  viewerIsSuperadmin={viewerIsSuperadmin}
                  onClick={() => setZapOpen(true)}
                />
              }
            >
              <div
                key={`zap-${apiPick?.id ?? "manual"}`}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field
                  label="Base URL"
                  name="apiBaseUrl"
                  defaultValue={apiPick?.baseUrl ?? cliente.apiBaseUrl}
                />
                <Field
                  label="Instância"
                  name="apiInstanciaNome"
                  defaultValue={apiPick?.nome ?? cliente.apiInstanciaNome}
                />
                {viewerIsSuperadmin && (
                  <PasswordField
                    label="Token API WhatsApp (apenas superadmin)"
                    name="apiToken"
                    defaultValue={apiPick?.token ?? cliente.apiToken}
                    hint="Token do provedor (Z-API/Uazapi/Evolution). Click no olho para mostrar. Nunca exibido para o cliente comum."
                  />
                )}
              </div>
            </Group>

            <Group
              title="Integração CRM"
              actions={
                <a
                  href="#crm-funis-anchor"
                  className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                >
                  ↓ Funis
                </a>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {viewerIsSuperadmin && (
                  <PasswordField
                    label="Token CRM (apenas superadmin)"
                    name="crmToken"
                    defaultValue={cliente.crmToken}
                    hint="Bearer token do CRM. Click no olho para mostrar. Não exibido para o cliente."
                  />
                )}
                <Field
                  label="Origem ID"
                  name="crmOrigemId"
                  defaultValue={cliente.crmOrigemId}
                  hint="ID da origem do lead no CRM."
                />
              </div>

              <div
                id="crm-funis-anchor"
                className="mt-5 pt-4"
                style={{ borderTop: "1px dashed var(--b-soft)" }}
              >
                <p className="text-[12.5px] font-medium text-[color:var(--fg)] mb-1">
                  Funis e etapas do CRM
                </p>
                <p className="text-[11.5px] text-[color:var(--fg-subtle)] mb-3">
                  Cada slot tem nome (livre) + ID (do CRM) + slug (fixo, usado
                  pelo backend). Use o helper "Buscar do CRM" abaixo para
                  preencher automaticamente.
                </p>
                <CrmStatusSlots colunas={cliente.crmStatusColunas} />
              </div>
            </Group>

            <Group title="Segurança">
              <Field
                label="Nova senha"
                name="novaSenha"
                type="password"
                hint="Deixe em branco para manter. Mínimo 6 caracteres."
              />
            </Group>

            <div className="flex items-center justify-end gap-2">
              <Link href={pathname} className="btn-ghost">
                Cancelar
              </Link>
              <SaveButton>Salvar configurações</SaveButton>
            </div>
          </form>

          <Group title={`Lojas (${cliente.lojas.length})`}>
            <LojasSection
              lojas={cliente.lojas}
              isSuperadmin={cliente.isSuperadmin}
            />
          </Group>
        </div>
      </div>

      {zapOpen && (
        <WhatsappInstanciasPicker
          onClose={() => setZapOpen(false)}
          onPick={(inst) => {
            setApiPick(inst);
            setZapOpen(false);
          }}
        />
      )}
    </div>
  );
}

function WhatsappInstanciasPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (i: WhatsappInstancia) => void;
}) {
  const [instancias, setInstancias] = useState<WhatsappInstancia[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
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

  useEffect(() => {
    start(async () => {
      const res = await fetchWhatsappInstanciasAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInstancias(res.instancias);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setError(null);
    setLoaded(false);
    start(async () => {
      const res = await fetchWhatsappInstanciasAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInstancias(res.instancias);
      setLoaded(true);
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instancias;
    return instancias.filter((i) => {
      return (
        i.nome.toLowerCase().includes(q) ||
        (i.baseUrl ?? "").toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    });
  }, [instancias, query]);

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
              Instâncias WhatsApp da Groner
            </p>
            <p className="text-[14px] font-medium text-[color:var(--fg)]">
              Selecionar para preencher Base URL, Instância e Token
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
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar instância por nome, host ou ID..."
              className="w-full rounded-[10px] py-[10px] pl-3 pr-12 text-[13px] focus:outline-none"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            />
            <button
              type="button"
              onClick={refresh}
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
                backgroundColor: "rgba(248,113,113,0.06)",
                color: "#fca5a5",
                border: "1px solid rgba(248,113,113,0.22)",
              }}
            >
              {error}
            </div>
          )}
          {pending && !loaded && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              Buscando instâncias...
            </div>
          )}
          {loaded && filtered.length === 0 && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              {query
                ? `Nenhuma instância corresponde a "${query}".`
                : "API Groner não retornou instâncias para este tenant."}
            </div>
          )}
          {loaded && filtered.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "var(--b-soft)" }}>
              {filtered.map((i) => (
                <li key={i.id || i.nome}>
                  <button
                    type="button"
                    onClick={() => onPick(i)}
                    className="w-full text-left px-3 py-2 hover:bg-[color:var(--ink-3)] transition-colors"
                  >
                    <p className="text-[13px] text-[color:var(--fg)] truncate">
                      {i.nome || i.id}
                    </p>
                    <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                      {i.baseUrl ?? "—"}
                      {i.id ? ` · #${i.id}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer
          className="px-4 py-2.5 text-[11px] text-[color:var(--fg-subtle)] flex items-center justify-between"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <span>
            {loaded ? `${filtered.length} de ${instancias.length}` : "—"}
          </span>
          <span className="numerics">ESC fecha</span>
        </footer>
      </div>
    </div>
  );
}

function Group({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-medium tracking-tight text-[color:var(--fg)] uppercase letter-spacing-wider">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
