import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes, automacoes, clientes, leads } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";

export default async function FlowsHomePage() {
  const [
    [clientesCountRow],
    [agentesCountRow],
    [automacoesCountRow],
    [leadsCountRow],
    clientesAtivos,
  ] = await Promise.all([
    db.select({ v: count() }).from(clientes),
    db.select({ v: count() }).from(agentes),
    db.select({ v: count() }).from(automacoes),
    db.select({ v: count() }).from(leads),
    db
      .select({ v: count() })
      .from(clientes)
      .where(eq(clientes.isActive, true)),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Groner · superadmin"
        title="Flows"
        subtitle="Console de gestão multi-tenant. Acesso restrito ao superadmin Groner."
      />

      <div className="px-7 pb-12 space-y-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Clientes" value={String(clientesCountRow.v)} />
          <Kpi
            label="Clientes ativos"
            value={String(clientesAtivos[0]?.v ?? 0)}
          />
          <Kpi label="Agentes IA" value={String(agentesCountRow.v)} />
          <Kpi label="Automações" value={String(automacoesCountRow.v)} />
          <Kpi label="Leads (total)" value={String(leadsCountRow.v)} />
        </section>

        <section>
          <div className="label-eyebrow mb-3">Áreas de gestão</div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card
              href="/clientes"
              eyebrow="Tenants"
              title="Clientes"
              hint="Cadastrar, editar e deletar tenants. Configurar WhatsApp, CRM, lojas e usuários por tenant."
            />
            <Card
              href="/automacoes"
              eyebrow="Fluxos N8N"
              title="Automações"
              hint="Registrar e gerenciar automações N8N vinculadas a cada loja. Cadastro, edição inline, drilldown por loja."
            />
            <Card
              href="/lojas"
              eyebrow="Cadastro"
              title="Lojas"
              hint="Visão cross-tenant das unidades físicas cadastradas."
            />
            <Card
              href="/dashboard"
              eyebrow="Métricas"
              title="Dashboard Looper"
              hint="Funil, follow-ups e agentes do tenant Looper (visão como admin)."
            />
            <Card
              href="/leads"
              eyebrow="Pipeline"
              title="Leads"
              hint="Pipeline do tenant Looper. Cross-tenant deferido."
            />
            <Card
              href="/agendamentos"
              eyebrow="Agenda"
              title="Agendamentos"
              hint="Lista de agendamentos do tenant Looper."
            />
          </ul>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <div className="label-eyebrow">{label}</div>
      <div className="serif text-[36px] leading-none mt-3 text-[color:var(--fg)]">
        {value}
      </div>
    </article>
  );
}

function Card({
  href,
  eyebrow,
  title,
  hint,
}: {
  href: string;
  eyebrow: string;
  title: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-xl p-5 transition-colors hover:bg-[color:var(--ink-4)]"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <div className="label-eyebrow">{eyebrow}</div>
        <h3 className="serif text-[20px] leading-tight mt-1 text-[color:var(--fg)]">
          {title}
        </h3>
        <p className="text-[12.5px] text-[color:var(--fg-muted)] mt-2 leading-snug">
          {hint}
        </p>
        <p className="text-[11px] text-[color:var(--mint-300)] mt-3">
          Abrir →
        </p>
      </Link>
    </li>
  );
}
