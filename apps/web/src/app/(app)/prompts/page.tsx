import Link from "next/link";
import { readSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/guard";
import { listAgentesByCliente } from "@/server/services/agentes";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { DetailModal } from "@/components/detail-modal";

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; detail?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const owner = isOwner(session);
  const { q, detail } = await searchParams;
  const all = await listAgentesByCliente(session.clienteId, q);
  const items = all.filter((a) => !!a.prompt);
  const detailItem = detail
    ? items.find((a) => a.id === Number(detail))
    : null;

  return (
    <>
      <PageHeader
        title="Prompts"
        subtitle="Apenas automações com prompt configurado."
        actions={<SearchBox placeholder="Buscar por nome ou conteúdo do prompt..." />}
      />
      <div className="px-6 pb-12">
        <div className="overflow-hidden rounded-lg border border-[color:var(--b-soft)] bg-[color:var(--ink-3)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--ink-2)] text-[color:var(--fg-muted)] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Automação</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Leads</th>
                <th className="text-right px-4 py-3">Atendidos IA</th>
                <th className="text-left px-4 py-3">n8n</th>
                <th className="text-right px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-[color:var(--fg-subtle)]"
                  >
                    {q ? `Nenhum prompt corresponde a "${q}".` : "Nenhuma automação com prompt configurado."}
                  </td>
                </tr>
              )}
              {items.map((a) => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                params.set("detail", String(a.id));
                return (
                  <tr key={a.id} className="border-t border-[color:var(--b-soft)]">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`?${params.toString()}`} className="hover:text-[color:var(--mint-300)]">
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? (
                        <span className="text-[color:var(--mint-300)] text-xs">ativo</span>
                      ) : (
                        <span className="text-[color:var(--fg-subtle)] text-xs">inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{a.leadsAtendidos}</td>
                    <td className="px-4 py-3 text-right font-mono">{a.leadsAtendidosIa}</td>
                    <td className="px-4 py-3 text-[color:var(--fg-subtle)] font-mono text-xs">{a.idN8n ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`?${params.toString()}`}
                        className="btn-ghost text-xs"
                      >
                        Ver prompt
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailItem && (
        <DetailModal
          title={detailItem.name}
          subtitle={detailItem.description ?? "Prompt da automação"}
          footer={
            owner ? (
              <Link
                href={`/agentes`}
                className="rounded-md  px-4 py-2 text-sm font-medium text-[color:var(--mint-50)]"
              >
                Editar no /agentes
              </Link>
            ) : null
          }
        >
          <pre className="rounded-md bg-[color:var(--ink-2)] border border-[color:var(--b-soft)] p-4 text-sm text-[color:var(--fg)] whitespace-pre-wrap font-mono leading-relaxed max-h-[60vh] overflow-auto">
            {detailItem.prompt}
          </pre>
        </DetailModal>
      )}
    </>
  );
}
