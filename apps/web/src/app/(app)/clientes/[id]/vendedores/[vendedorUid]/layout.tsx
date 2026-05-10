import Link from "next/link";
import { forbidden } from "next/navigation";
import { loadClienteOrForbid } from "../../_data";
import { loadVendedor } from "./_data";
import { TabNav, type TabItem } from "../../_components/tab-nav";

export default async function VendedorDrilldownLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; vendedorUid: string }>;
}) {
  const { id, vendedorUid } = await params;
  const clienteId = Number(id);
  const { cliente, isVendedor, vendedorUserId } =
    await loadClienteOrForbid(clienteId);
  const vendedor = await loadVendedor(clienteId, vendedorUid);

  // Vendedor (kind=usuario) só vê o próprio uid.
  if (isVendedor && vendedor.id !== vendedorUserId) {
    forbidden();
  }

  const base = `/clientes/${clienteId}/vendedores/${vendedorUid}`;
  const tabs: TabItem[] = [
    { href: `${base}/dados`, label: "Dados" },
    { href: `${base}/horarios`, label: "Horários" },
    { href: `${base}/leads`, label: "Leads" },
  ];

  return (
    <div className="p-5 space-y-3">
      <nav
        aria-label="Breadcrumb"
        className="text-[12px] text-[color:var(--fg-subtle)] flex items-center gap-1.5 flex-wrap"
      >
        <Link
          href={`/clientes/${clienteId}/vendedores`}
          className="hover:text-[color:var(--fg)] transition-colors"
          style={{ color: "var(--fg-muted)" }}
        >
          Vendedores
        </Link>
        <span aria-hidden>›</span>
        <span style={{ color: "var(--fg)" }}>
          {vendedor.nome ?? "(sem nome)"}
        </span>
      </nav>
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-[20px] font-medium text-[color:var(--fg)]">
          {vendedor.nome ?? "(sem nome)"}
        </h2>
        {vendedor.email && (
          <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
            · {vendedor.email}
          </span>
        )}
        <span className="text-[10.5px] text-[color:var(--fg-subtle)] ml-2 numerics">
          uid: {vendedor.uid.slice(0, 8)}…
        </span>
        <Link
          href={`/clientes/${cliente.id}/vendedores`}
          className="ml-auto text-[11.5px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition-colors"
        >
          ← Voltar para vendedores
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
