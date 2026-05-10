import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/guard";
import {
  listAgentesByCliente,
  listAllAgentes,
} from "@/server/services/agentes";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { DetailModal } from "@/components/detail-modal";
import { Switch } from "@/components/switch";
import {
  listClientesParaSuperAction,
  toggleAgenteActiveAction,
} from "./actions";
import { AgenteCreateModal } from "./agente-create-modal";

type View = "card" | "table";

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    detail?: string;
    view?: string;
    new?: string;
  }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const owner = isOwner(session);
  const sp = await searchParams;
  const q = sp.q;
  const detail = sp.detail;
  const isNew = sp.new === "1";
  // Default = tabela (padronização com leads/usuarios/prompts)
  const view: View = sp.view === "card" ? "card" : "table";

  // Superadmin lê superadmin fresh do DB pra liberar cross-tenant.
  let isSuper = false;
  if (session.kind === "cliente") {
    const me = await db
      .select({ isSuperadmin: clientes.isSuperadmin })
      .from(clientes)
      .where(eq(clientes.id, session.clienteId))
      .limit(1);
    isSuper = me[0]?.isSuperadmin === true;
  }

  // Superadmin vê automações de todos os tenants. Cliente comum só do próprio.
  const items = isSuper
    ? await listAllAgentes(q)
    : await listAgentesByCliente(session.clienteId, q);
  const detailItem = detail ? items.find((a) => a.id === Number(detail)) : null;
  const clientesParaPicker = isSuper && isNew
    ? await listClientesParaSuperAction()
    : [];

  function buildHref(extra: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = { q, view, new: isNew ? "1" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    return next.toString() ? `?${next.toString()}` : "?";
  }

  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Automações"
        subtitle="Suas automações contratadas. Marketplace virá em fase 2."
        actions={
          <div className="flex items-center gap-3">
            <ViewSwitcher current={view} buildHref={buildHref} />
            <SearchBox placeholder="Buscar por nome, descrição, prompt..." />
            {isSuper && (
              <Link
                href={buildHref({ new: "1" })}
                className="text-[12px] px-3 py-1.5 rounded-md"
                style={{
                  backgroundColor: "rgba(70,200,154,0.10)",
                  color: "var(--mint-200)",
                  border: "1px solid rgba(70,200,154,0.32)",
                }}
              >
                + Nova automação
              </Link>
            )}
          </div>
        }
      />

      <div className="px-7 pb-12">
        {items.length === 0 ? (
          <p className="text-[color:var(--fg-subtle)] text-[13px]">
            {q ? `Nenhum resultado para "${q}".` : "Nenhuma automação cadastrada."}
          </p>
        ) : view === "card" ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {items.map((a) => (
              <li
                key={a.id}
                className="rounded-xl p-5 flex flex-col"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-base)",
                  boxShadow: "var(--glow-sm)",
                }}
              >
                <Link
                  href={buildHref({ detail: String(a.id) })}
                  className="flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight hover:text-[color:var(--mint-300)] text-[15px]">
                      {a.name}
                    </h3>
                  </div>
                  {a.description && (
                    <p className="text-[13px] text-[color:var(--fg-muted)] mt-2 line-clamp-3">
                      {a.description}
                    </p>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[color:var(--fg-muted)]">
                    <Stat k="Debounce" v={`${a.debounceTime}s`} />
                    <Stat k="Max follow-ups" v={String(a.maxFollowups)} />
                    <Stat k="Intervenção" v={a.humanIntervention ? "humana" : "auto"} />
                    <Stat k="Voz" v={a.voiceGender ?? "—"} />
                    <Stat k="Leads" v={String(a.leadsAtendidos)} />
                    <Stat k="IA" v={String(a.leadsAtendidosIa)} />
                  </dl>
                </Link>
                <div
                  className="mt-4 pt-3 flex items-center justify-between"
                  style={{ borderTop: "1px solid var(--b-soft)" }}
                >
                  <span className="text-[11px] text-[color:var(--fg-subtle)]">
                    n8n: <span className="numerics">{a.idN8n ?? "—"}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    {owner ? (
                      <>
                        <Switch
                          id={a.id}
                          checked={a.isActive}
                          action={toggleAgenteActiveAction}
                          label={a.isActive ? "Desativar" : "Ativar"}
                        />
                        <Link
                          href={`/automacoes/${a.id}/editar`}
                          className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                        >
                          Editar
                        </Link>
                      </>
                    ) : (
                      <span
                        className={
                          a.isActive
                            ? "text-[11px] text-[color:var(--mint-300)]"
                            : "text-[11px] text-[color:var(--fg-subtle)]"
                        }
                      >
                        {a.isActive ? "ativa" : "inativa"}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="overflow-hidden rounded-xl"
            style={{
              backgroundColor: "var(--ink-3)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <table className="table-editorial">
              <thead>
                <tr>
                  {isSuper && <th>Tenant</th>}
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th className="text-right">Debounce</th>
                  <th className="text-right">Max FU</th>
                  <th>Voz</th>
                  <th>n8n</th>
                  <th className="text-center">Ativo</th>
                  {owner && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    {isSuper && (
                      <td className="text-[color:var(--fg-muted)] text-[12.5px]">
                        {a.clienteNome ?? a.clienteTenant ?? `#${a.clienteId}`}
                      </td>
                    )}
                    <td className="font-medium">
                      <Link
                        href={buildHref({ detail: String(a.id) })}
                        className="hover:text-[color:var(--mint-300)]"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="text-[color:var(--fg-muted)] max-w-sm truncate">
                      {a.description ?? "—"}
                    </td>
                    <td className="text-right numerics">{a.debounceTime}s</td>
                    <td className="text-right numerics">{a.maxFollowups}</td>
                    <td className="text-[color:var(--fg-muted)]">{a.voiceGender ?? "—"}</td>
                    <td className="numerics text-[11px] text-[color:var(--fg-subtle)]">
                      {a.idN8n ?? "—"}
                    </td>
                    <td className="text-center">
                      {owner ? (
                        <Switch
                          id={a.id}
                          checked={a.isActive}
                          action={toggleAgenteActiveAction}
                          label={a.isActive ? "Desativar" : "Ativar"}
                        />
                      ) : a.isActive ? (
                        <span className="text-[color:var(--mint-300)] text-[11px]">ativa</span>
                      ) : (
                        <span className="text-[color:var(--fg-subtle)] text-[11px]">inativa</span>
                      )}
                    </td>
                    {owner && (
                      <td className="text-right">
                        <Link
                          href={`/automacoes/${a.id}/editar`}
                          className="text-[12px] text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                        >
                          Editar
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isSuper && isNew && (
        <AgenteCreateModal clientes={clientesParaPicker} />
      )}

      {detailItem && (
        <DetailModal
          eyebrow="Automação"
          title={detailItem.name}
          subtitle={detailItem.description ?? "Detalhes da automação"}
          footer={
            owner ? (
              <Link
                href={`/automacoes/${detailItem.id}/editar`}
                className="btn-primary"
              >
                Editar automação
              </Link>
            ) : null
          }
        >
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-3">
              <FieldBlock k="Status" v={detailItem.isActive ? "ativa" : "inativa"} />
              <FieldBlock k="Debounce" v={`${detailItem.debounceTime}s`} />
              <FieldBlock k="Max follow-ups" v={String(detailItem.maxFollowups)} />
              <FieldBlock
                k="Intervenção humana"
                v={detailItem.humanIntervention ? "sim" : "não"}
              />
              <FieldBlock k="Voz" v={detailItem.voiceGender ?? "—"} />
              <FieldBlock k="ID n8n" v={detailItem.idN8n ?? "—"} />
              <FieldBlock k="Leads no cliente" v={String(detailItem.leadsAtendidos)} />
              <FieldBlock k="Atendidos pela IA" v={String(detailItem.leadsAtendidosIa)} />
            </section>

            <section>
              <div className="label-eyebrow mb-2">Prompt</div>
              <pre
                className="rounded-md p-4 text-[13px] whitespace-pre-wrap font-mono leading-relaxed max-h-[40vh] overflow-auto"
                style={{
                  backgroundColor: "var(--ink-2)",
                  border: "1px solid var(--b-soft)",
                  color: "var(--fg)",
                }}
              >
                {detailItem.prompt ?? "(sem prompt configurado)"}
              </pre>
            </section>
          </div>
        </DetailModal>
      )}
    </>
  );
}

function ViewSwitcher({
  current,
  buildHref,
}: {
  current: View;
  buildHref: (extra: Record<string, string | undefined>) => string;
}) {
  return (
    <div
      className="rounded-md p-[3px] text-[12px] flex"
      style={{
        backgroundColor: "var(--ink-2)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <ViewTab href={buildHref({ view: undefined })} active={current === "card"} label="Cards" />
      <ViewTab href={buildHref({ view: "table" })} active={current === "table"} label="Tabela" />
    </div>
  );
}

function ViewTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1 transition-colors"
      style={
        active
          ? {
              backgroundColor: "rgba(70,200,154,0.10)",
              color: "var(--mint-200)",
            }
          : { color: "var(--fg-muted)" }
      }
    >
      {label}
    </Link>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[color:var(--fg-subtle)] text-[10.5px] uppercase tracking-[0.12em]">
        {k}
      </dt>
      <dd className="numerics text-[12.5px] mt-0.5">{v}</dd>
    </div>
  );
}

function FieldBlock({ k, v }: { k: string; v: string }) {
  return (
    <div
      className="info-block"
    >
      <p className="label-eyebrow">{k}</p>
      <p className="numerics text-[13px] mt-1">{v}</p>
    </div>
  );
}
