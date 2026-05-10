import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { getDashboardData } from "@/server/services/dashboard";
import { PageHeader } from "@/components/page-header";

const dtFollowup = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function DashboardPage() {
  const session = await readSession();
  if (!session) return null;
  const data = await getDashboardData(session);
  if (!data) {
    // Cliente do cookie não existe mais. Cookies só podem ser mutados
    // em Route Handler ou Server Action — delegamos a limpeza da sessão
    // pra /api/logout.
    redirect("/api/logout?reason=cliente-removido");
  }
  const { totals, leadsByOrigem, agentes } = data;
  const greeting =
    session.name?.split(" ")[0] ?? data.cliente.nome ?? session.email;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={`Bom dia, ${greeting}.`}
        subtitle={
          session.kind === "cliente"
            ? `Resumo da operação de ${data.cliente.nome ?? "sua loja"} — todos os usuários do tenant.`
            : "Apenas seus próprios leads e agendamentos. O dono da loja vê todo o resto."
        }
      />

      <div className="px-7 pb-14 space-y-10">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
          <Kpi
            label="Automações ativas"
            value={`${totals.agentesAtivos}`}
            unit={`/ ${totals.agentesTotal}`}
            hint="ativas / contratadas"
            tone="primary"
          />
          <Kpi
            label="Leads em atendimento"
            value={String(totals.leadsAtivos)}
            hint={`IA ${leadsByOrigem.ia}  ·  Humano ${leadsByOrigem.humano}`}
          />
          <Kpi
            label="Agendamentos"
            value={String(totals.agendamentosProximos)}
            hint="próximos 7 dias"
          />
          <Kpi
            label="Usuários ativos"
            value={String(totals.usuariosAtivos)}
            unit={`/ ${totals.usuariosTotal}`}
            hint="cadastrados"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-3 lift-in">
          <article className="surface lg:col-span-2 p-7">
            <div className="flex items-end justify-between mb-1">
              <div>
                <div className="label-eyebrow">Pipeline</div>
                <h2 className="serif text-[22px] mt-1 leading-tight">
                  Funil de leads
                </h2>
              </div>
              {data.funil.some((f) => f.total > 0) ? (
                <span className="chip chip-mint">ao vivo</span>
              ) : (
                <span className="chip">sem dados</span>
              )}
            </div>

            <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.funil.map((f, i) => (
                <FunnelCard
                  key={f.etapa}
                  index={i + 1}
                  etapa={f.etapa}
                  total={f.total}
                  isLast={i === data.funil.length - 1}
                />
              ))}
            </div>
          </article>

          <article className="surface p-7">
            <div className="label-eyebrow">Agenda</div>
            <h2 className="serif text-[22px] mt-1 leading-tight">
              Próximos follow-ups
            </h2>
            <p className="text-[12.5px] text-[color:var(--fg-subtle)] mt-1">
              top 5 por <span className="numerics">proximo_followup</span>
            </p>

            <ul className="mt-5 -mx-2">
              {data.proximosFollowups.length === 0 && (
                <li className="px-2 py-3 text-[13px] text-[color:var(--fg-subtle)]">
                  Nenhum follow-up agendado.
                </li>
              )}
              {data.proximosFollowups.map((l) => (
                <li
                  key={l.id}
                  className="px-2 py-2.5 flex items-center justify-between gap-3 rounded-md hover:bg-[color:var(--ink-4)] transition-colors"
                >
                  <span className="text-[13px] text-[color:var(--fg)] truncate">
                    {l.nome ?? l.telefone ?? `Lead #${l.id}`}
                  </span>
                  <span className="numerics text-[11.5px] text-[color:var(--fg-subtle)] whitespace-nowrap">
                    {l.proximoFollowup
                      ? dtFollowup.format(new Date(l.proximoFollowup))
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="surface p-7 lift-in">
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="label-eyebrow">Automações</div>
              <h2 className="serif text-[22px] mt-1 leading-tight">
                Agentes IA do cliente
              </h2>
            </div>
            <span className="numerics text-[12px] text-[color:var(--fg-subtle)]">
              {agentes.length} agente
              {agentes.length === 1 ? "" : "s"}
            </span>
          </div>

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {agentes.length === 0 && (
              <li className="text-[13px] text-[color:var(--fg-subtle)]">
                Nenhum agente cadastrado.
              </li>
            )}
            {agentes.map((a) => (
              <li
                key={a.id}
                className="rounded-xl p-5 transition-colors hover:bg-[color:var(--ink-4)]"
                style={{
                  backgroundColor: "var(--ink-2)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-[14.5px] text-[color:var(--fg)] truncate">
                      {a.name}
                    </div>
                    <div className="text-[12px] text-[color:var(--fg-subtle)] mt-0.5">
                      n8n ·{" "}
                      <span className="numerics">{a.idN8n ?? "—"}</span>
                    </div>
                  </div>
                  <span
                    className={a.isActive ? "chip chip-mint" : "chip"}
                    style={a.isActive ? undefined : { opacity: 0.6 }}
                  >
                    {a.isActive ? "ativo" : "inativo"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-4">
                  <Mini k="debounce" v={`${a.debounceTime}s`} />
                  <Mini k="follow-ups" v={String(a.maxFollowups)} />
                  <Mini
                    k="humano"
                    v={a.humanIntervention ? "sim" : "não"}
                  />
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone?: "default" | "primary";
}) {
  return (
    <article className="kpi-card">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={
            tone === "primary"
              ? "serif text-[44px] leading-none text-[color:var(--mint-300)]"
              : "serif text-[44px] leading-none text-[color:var(--fg)]"
          }
        >
          {value}
        </span>
        {unit && (
          <span className="numerics text-[14px] text-[color:var(--fg-subtle)]">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-3 text-[12px] text-[color:var(--fg-subtle)] tracking-tight">
        {hint}
      </div>
    </article>
  );
}

function FunnelCard({
  index,
  etapa,
  total,
  isLast,
}: {
  index: number;
  etapa: string;
  total: number;
  isLast: boolean;
}) {
  return (
    <div
      className="rounded-xl px-4 py-4 relative"
      style={{
        backgroundColor: "var(--ink-2)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="numerics text-[10.5px] text-[color:var(--fg-disabled)]">
          {String(index).padStart(2, "0")}
        </span>
        {!isLast && (
          <span
            aria-hidden
            className="text-[10px] text-[color:var(--fg-disabled)]"
          >
            →
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-[color:var(--fg-muted)] mt-1.5 truncate">
        {etapa}
      </div>
      <div className="serif text-[28px] mt-2 leading-none text-[color:var(--fg)]">
        {total}
      </div>
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--fg-subtle)]">
        {k}
      </div>
      <div className="numerics text-[12.5px] text-[color:var(--fg)] mt-0.5">
        {v}
      </div>
    </div>
  );
}
