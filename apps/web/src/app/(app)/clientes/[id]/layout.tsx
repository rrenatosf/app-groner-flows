import Link from "next/link";
import { loadClienteOrForbid } from "./_data";
import { Breadcrumb } from "./_components/breadcrumb";
import { TabNav, type TabItem } from "./_components/tab-nav";

export default async function ClienteDrilldownLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const ctx = await loadClienteOrForbid(clienteId);
  const { cliente, isSuper } = ctx;

  const base = `/clientes/${clienteId}`;

  // Tabs disponíveis dependem da persona:
  // - Super: Dados | Lojas | Agentes | Automações | Leads | Agendamentos |
  //   Webhooks. Colunas CRM e Vendedores ficam DENTRO de Agentes (sub-tabs)
  //   porque são configurações do agente, não do cliente. Doc Notion
  //   "Remover vendedores e crm colunas do meio do cliente"
  //   (35c9084b98ef805083d4c2a6f7a2e84a).
  // - Cliente admin: Dados | Lojas | Agentes | Automações | Leads |
  //   Agendamentos.
  // - Vendedor: mesmo conjunto do cliente admin (gating fino nas
  //   listas/sub-rotas).
  const tabs: TabItem[] = [
    { href: `${base}/dados`, label: "Dados" },
    { href: `${base}/lojas`, label: "Lojas" },
    { href: `${base}/agentes`, label: "Agentes" },
    { href: `${base}/automacoes`, label: "Automações" },
    { href: `${base}/leads`, label: "Leads" },
    { href: `${base}/agendamentos`, label: "Agendamentos" },
  ];
  if (isSuper) tabs.push({ href: `${base}/webhooks`, label: "Webhooks" });

  return (
    <div className="pb-12">
      <Breadcrumb
        items={[
          { label: "Clientes", href: "/clientes" },
          { label: cliente.nome ?? `Cliente #${cliente.id}` },
        ]}
      />
      <div className="px-7 pt-3 flex items-baseline gap-3 flex-wrap mb-3">
        <div className="label-eyebrow">Cliente #{cliente.id}</div>
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          {cliente.nome ?? "(sem nome)"}
        </h1>
        {cliente.crmTenant && (
          <span className="text-[11.5px] text-[color:var(--fg-subtle)] numerics">
            · {cliente.crmTenant}
          </span>
        )}
        <Link
          href="/clientes"
          className="ml-auto text-[11.5px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition-colors"
        >
          ← Voltar para a lista
        </Link>
      </div>

      <div className="mt-4">
        <TabNav tabs={tabs} />
        <section
          style={{
            backgroundColor: "var(--ink-3)",
            borderLeft: "1px solid var(--b-soft)",
            borderRight: "1px solid var(--b-soft)",
            borderBottom: "1px solid var(--b-soft)",
          }}
          className="rounded-b-xl mx-7"
        >
          {children}
        </section>
      </div>
    </div>
  );
}
