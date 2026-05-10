import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clientes,
  isPlaceholderVendedor,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import {
  isClienteAdminReadOnly,
  isSuperadminFresh,
} from "@/lib/auth/guard";
import { LeadsTable } from "./leads-table";
import { resolveVendedorNome, type LeadRow } from "./saude-lead";
import type { VendedorOption } from "./actions";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;

  const isSuper = await isSuperadminFresh(session);
  // Cliente admin (kind=cliente, não super) é READ-ONLY total em leads —
  // edição passa pelo CRM (automações de follow-up criariam drift). Super
  // edita tudo, vendedor (kind=usuario) edita só follow-up dos próprios.
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;

  const { q } = await searchParams;
  const term = (q ?? "").trim();

  // Filtros base.
  const filters = [];
  if (!isSuper) filters.push(eq(leads.clienteId, session.clienteId));
  if (session.kind === "usuario") {
    filters.push(eq(leads.vendedorId, session.userId));
  }
  if (term) {
    const like = `%${term}%`;
    filters.push(
      or(
        ilike(leads.nome, like),
        ilike(leads.telefone, like),
        ilike(leads.leadId, like),
        ilike(leads.etapaNome, like),
        ilike(leads.statusNome, like),
      )!,
    );
  }

  const rowsRaw =
    filters.length > 0
      ? await db
          .select()
          .from(leads)
          .where(and(...filters))
          .orderBy(desc(leads.createdAt))
      : await db.select().from(leads).orderBy(desc(leads.createdAt));

  // Carrega clientes envolvidos nos leads (pra resolver tenant/nome
  // + lista de vendedores pra picker).
  const clienteIds = Array.from(
    new Set(
      rowsRaw
        .map((r) => r.clienteId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  // Sempre incluímos o cliente da sessão (caso lista venha vazia).
  if (!clienteIds.includes(session.clienteId)) {
    clienteIds.push(session.clienteId);
  }

  const clientesRows =
    clienteIds.length > 0
      ? await db
          .select({
            id: clientes.id,
            nome: clientes.nome,
            crmTenant: clientes.crmTenant,
            vendedores: clientes.vendedores,
          })
          .from(clientes)
          .where(inArray(clientes.id, clienteIds))
          .orderBy(asc(clientes.nome))
      : [];

  const clienteMap = new Map(
    clientesRows.map((c) => [
      c.id,
      {
        nome: c.nome,
        tenant: c.crmTenant,
        vendedores: Array.isArray(c.vendedores)
          ? (c.vendedores as Vendedor[])
          : [],
      },
    ]),
  );

  // Map clienteId → Map<vendedorId, Vendedor> pra resolver nome.
  const vendedoresPorClienteMap = new Map<number, Map<number, Vendedor>>();
  for (const [cid, info] of clienteMap.entries()) {
    const m = new Map<number, Vendedor>();
    for (const v of info.vendedores) {
      if (typeof v.id === "number") m.set(v.id, v);
    }
    vendedoresPorClienteMap.set(cid, m);
  }

  // Lista de opções pra picker — só vendedores válidos (não placeholder).
  const vendedoresPorCliente: Record<number, VendedorOption[]> = {};
  for (const [cid, info] of clienteMap.entries()) {
    vendedoresPorCliente[cid] = info.vendedores
      .filter((v) => !isPlaceholderVendedor(v))
      .map((v) => ({
        id: v.id,
        uid: v.uid,
        nome: v.nome ?? `Usuário #${v.id}`,
        role: v.role,
        is_active: v.is_active,
      }));
  }

  const allRows: LeadRow[] = rowsRaw.map((l) => {
    const c = l.clienteId !== null ? clienteMap.get(l.clienteId) : null;
    const venMap =
      l.clienteId !== null
        ? vendedoresPorClienteMap.get(l.clienteId) ?? new Map()
        : new Map<number, Vendedor>();
    return {
      ...l,
      clienteNome: c?.nome ?? null,
      clienteTenant: c?.tenant ?? null,
      vendedorNome: resolveVendedorNome(l, venMap),
    };
  });

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
            Leads
          </h1>
          <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
            {allRows.length} {allRows.length === 1 ? "lead" : "leads"}
            {term ? ` · "${term}"` : ""}
          </span>
        </div>
        {readOnlyReason === "cliente-admin" && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] max-w-[680px] mt-1">
            Leads são gerenciados pelo CRM. A edição inline está desabilitada
            pra clientes pra evitar conflitos com automações de follow-up.
            Para alterar atribuição, status ou próximo follow-up, use o CRM.
          </p>
        )}
      </div>

      <section
        className="rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <LeadsTable
          rows={allRows}
          isSuper={isSuper}
          canEdit={canEdit}
          isVendedor={session.kind === "usuario"}
          vendedoresPorCliente={vendedoresPorCliente}
          readOnlyReason={readOnlyReason}
        />
      </section>
    </div>
  );
}
