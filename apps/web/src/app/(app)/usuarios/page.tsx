import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clientes,
  isPlaceholderLoja,
  isPlaceholderVendedor,
  type Loja,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import { UsuariosTable, type UsuarioRow } from "./usuarios-table";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;

  const isSuper = await isSuperadminFresh(session);
  // Edição: super sempre, cliente kind=cliente sempre, usuário com role=owner.
  const me = await db.query.clientes.findFirst({
    where: eq(clientes.id, session.clienteId),
  });
  if (!me) return null;

  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (session.kind === "cliente") canEdit = true;
  else if (session.kind === "usuario") {
    const myVendedor = (me.vendedores ?? []).find(
      (v) => v.id === session.userId,
    );
    if (myVendedor?.role === "owner") canEdit = true;
  }

  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  const targetClientes = isSuper
    ? await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
          lojas: clientes.lojas,
          vendedores: clientes.vendedores,
        })
        .from(clientes)
    : [
        {
          id: me.id,
          nome: me.nome,
          crmTenant: me.crmTenant,
          lojas: me.lojas,
          vendedores: me.vendedores,
        },
      ];

  const allRows: UsuarioRow[] = targetClientes.flatMap((c) => {
    const lojasArr = Array.isArray(c.lojas) ? (c.lojas as Loja[]) : [];
    const lojasValid = lojasArr.filter((l) => !isPlaceholderLoja(l));
    const lojasMap: Record<string, string> = {};
    const lojasDoCliente: { id: string; nome: string }[] = [];
    for (const l of lojasValid) {
      if (typeof l.id === "string" && l.id) {
        lojasMap[l.id] = l.nome ?? "(sem nome)";
        lojasDoCliente.push({ id: l.id, nome: l.nome ?? "(sem nome)" });
      }
    }
    const vendedores = Array.isArray(c.vendedores)
      ? (c.vendedores as Vendedor[])
      : [];
    return vendedores
      .filter((v) => !isPlaceholderVendedor(v))
      .map((v) => ({
        clienteId: c.id,
        clienteNome: c.nome,
        clienteTenant: c.crmTenant,
        vendedor: v,
        lojasMap,
        lojasDoCliente,
      }));
  });

  // Cliente comum só vê os usuários do próprio tenant — já filtrado.
  // Vendedor (kind=usuario) vê usuários do próprio tenant — já filtrado.
  // Super vê todos.

  const filtered = query
    ? allRows.filter((r) => {
        const hay = [
          r.clienteNome,
          r.clienteTenant,
          r.vendedor.nome,
          r.vendedor.email,
          r.vendedor.telefone,
          r.vendedor.crm_id,
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
          Usuários
        </h1>
        <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
          {filtered.length}{" "}
          {filtered.length === 1 ? "usuário" : "usuários"}
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
        <UsuariosTable
          rows={filtered}
          isSuper={isSuper}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}
