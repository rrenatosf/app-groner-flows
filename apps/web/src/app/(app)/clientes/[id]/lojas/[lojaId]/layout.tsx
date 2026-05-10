import Link from "next/link";
import { loadClienteOrForbid } from "../../_data";
import { loadLoja } from "./_data";
import { TabNav, type TabItem } from "../../_components/tab-nav";

export default async function LojaDrilldownLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { cliente } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);

  const base = `/clientes/${clienteId}/lojas/${lojaId}`;
  const tabs: TabItem[] = [
    { href: `${base}/dados`, label: "Dados" },
    { href: `${base}/vendedores`, label: "Vendedores" },
    { href: `${base}/leads`, label: "Leads" },
    { href: `${base}/automacoes`, label: "Automações" },
  ];

  return (
    <div className="p-5 space-y-3">
      <nav
        aria-label="Breadcrumb"
        className="text-[12px] text-[color:var(--fg-subtle)] flex items-center gap-1.5 flex-wrap"
      >
        <Link
          href={`/clientes/${clienteId}/lojas`}
          className="hover:text-[color:var(--fg)] transition-colors"
          style={{ color: "var(--fg-muted)" }}
        >
          Lojas
        </Link>
        <span aria-hidden>›</span>
        <span style={{ color: "var(--fg)" }}>{loja.nome || "(sem nome)"}</span>
      </nav>
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-[20px] font-medium text-[color:var(--fg)]">
          {loja.nome || "(sem nome)"}
        </h2>
        {loja.crm_id && (
          <span className="text-[11.5px] text-[color:var(--fg-subtle)] numerics">
            · CRM #{loja.crm_id}
          </span>
        )}
        <span className="text-[10.5px] text-[color:var(--fg-subtle)] ml-2 numerics">
          {loja.id}
        </span>
        <Link
          href={`/clientes/${cliente.id}/lojas`}
          className="ml-auto text-[11.5px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition-colors"
        >
          ← Voltar para lojas
        </Link>
      </div>

      <div className="-mx-5">
        <TabNav tabs={tabs} />
        <div
          style={{
            backgroundColor: "var(--ink-2)",
            borderLeft: "1px solid var(--b-soft)",
            borderRight: "1px solid var(--b-soft)",
            borderBottom: "1px solid var(--b-soft)",
          }}
          className="rounded-b-lg mx-5"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
