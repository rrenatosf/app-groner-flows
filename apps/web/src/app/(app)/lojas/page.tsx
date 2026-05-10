import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, isPlaceholderLoja, type Loja } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import { LojasTable, type LojaRow } from "./lojas-table";

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;

  const isSuper = await isSuperadminFresh(session);
  // Vendedor (kind=usuario) é read-only.
  const canEdit = session.kind === "cliente";

  const me = await db.query.clientes.findFirst({
    where: eq(clientes.id, session.clienteId),
  });
  if (!me) return null;

  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  // Super: lojas de todos os clientes. Cliente comum / vendedor: só do próprio.
  const targetClientes = isSuper
    ? await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
          lojas: clientes.lojas,
        })
        .from(clientes)
    : [
        {
          id: me.id,
          nome: me.nome,
          crmTenant: me.crmTenant,
          lojas: me.lojas,
        },
      ];

  const allRows: LojaRow[] = targetClientes.flatMap((c) => {
    const list = Array.isArray(c.lojas) ? (c.lojas as Loja[]) : [];
    return list
      .filter((l) => !isPlaceholderLoja(l))
      .map((loja) => ({
        clienteId: c.id,
        clienteNome: c.nome,
        clienteTenant: c.crmTenant,
        loja,
      }));
  });

  const filtered = query
    ? allRows.filter((r) => {
        const hay = [
          r.clienteNome,
          r.clienteTenant,
          r.loja.nome,
          r.loja.crm_id,
          r.loja.cnpj,
          r.loja.telefone,
          r.loja.endereco,
          r.loja.endereco_cidade,
          r.loja.endereco_estado,
        ]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return hay.includes(query);
      })
    : allRows;

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          Lojas
        </h1>
        <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
          {filtered.length} {filtered.length === 1 ? "loja" : "lojas"}
          {query ? ` · "${query}"` : ""}
        </span>
      </div>

      <section
        className="rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <LojasTable rows={filtered} isSuper={isSuper} canEdit={canEdit} />
      </section>
    </div>
  );
}
