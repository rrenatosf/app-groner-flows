import { loadClienteOrForbid } from "../_data";
import { TabNav, type TabItem } from "../_components/tab-nav";

/** Layout da aba "Agentes" do cliente — sub-tabs internas porque
 *  Colunas CRM e Vendedores são configurações do agente, não do cliente.
 *  Doc Notion (35c9084b98ef805083d4c2a6f7a2e84a). */
export default async function ClienteAgentesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { isSuper } = await loadClienteOrForbid(clienteId);

  const base = `/clientes/${clienteId}/agentes`;
  const tabs: TabItem[] = [
    { href: base, label: "Lista de agentes", exactMatch: true },
    { href: `${base}/vendedores`, label: "Vendedores" },
  ];
  if (isSuper) {
    tabs.push({ href: `${base}/colunas-crm`, label: "Colunas CRM" });
  }

  return (
    <div className="px-5 pt-4 pb-2">
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
