import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agendamentos,
  clientes,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import {
  isClienteAdminReadOnly,
  isSuperadminFresh,
} from "@/lib/auth/guard";
import { AgendamentosTable } from "./agendamentos-table";
import { resolveVendedorNome } from "../leads/saude-lead";
import type { AgendamentoRow } from "./saude-agendamento";

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;

  const isSuper = await isSuperadminFresh(session);
  // Cliente admin (kind=cliente, não super) é READ-ONLY total em
  // agendamentos — reagendamento passa pelo vendedor responsável ou pelo
  // CRM (automações de notificação criariam drift). Super edita tudo,
  // vendedor (kind=usuario) edita só agendamentos dos próprios leads.
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;

  const { q } = await searchParams;
  const term = (q ?? "").trim();

  // Filtros base. Sempre joinamos leads → garantimos clienteId/vendedorId.
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
        ilike(agendamentos.statusAgendamento, like),
        ilike(agendamentos.observacaoAgendamento, like),
      )!,
    );
  }

  const baseSelect = db
    .select({
      // agendamento
      id: agendamentos.id,
      createdAt: agendamentos.createdAt,
      leadId: agendamentos.leadId,
      dataAgendamento: agendamentos.dataAgendamento,
      statusAgendamento: agendamentos.statusAgendamento,
      observacaoAgendamento: agendamentos.observacaoAgendamento,
      // lead joined
      leadNome: leads.nome,
      leadTelefone: leads.telefone,
      leadClienteId: leads.clienteId,
      vendedorId: leads.vendedorId,
      vendedorSnap: leads.vendedor,
    })
    .from(agendamentos)
    .innerJoin(leads, eq(leads.id, agendamentos.leadId));

  const rowsRaw =
    filters.length > 0
      ? await baseSelect
          .where(and(...filters))
          .orderBy(desc(agendamentos.dataAgendamento))
      : await baseSelect.orderBy(desc(agendamentos.dataAgendamento));

  // Carrega clientes envolvidos (pra resolver tenant/nome + vendedores).
  const clienteIds = Array.from(
    new Set(
      rowsRaw
        .map((r) => r.leadClienteId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  if (!isSuper && !clienteIds.includes(session.clienteId)) {
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

  const allRows: AgendamentoRow[] = rowsRaw.map((r) => {
    const c = r.leadClienteId !== null ? clienteMap.get(r.leadClienteId) : null;
    const venMap =
      r.leadClienteId !== null
        ? vendedoresPorClienteMap.get(r.leadClienteId) ?? new Map()
        : new Map<number, Vendedor>();
    return {
      id: r.id,
      createdAt: r.createdAt,
      leadId: r.leadId,
      dataAgendamento: r.dataAgendamento,
      statusAgendamento: r.statusAgendamento,
      observacaoAgendamento: r.observacaoAgendamento,
      clienteId: r.leadClienteId,
      clienteNome: c?.nome ?? null,
      clienteTenant: c?.tenant ?? null,
      leadNome: r.leadNome,
      leadTelefone: r.leadTelefone,
      vendedorId: r.vendedorId,
      vendedorNome: resolveVendedorNome(
        { vendedorId: r.vendedorId, vendedor: r.vendedorSnap },
        venMap,
      ),
    };
  });

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
            Agendamentos
          </h1>
          <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
            {allRows.length}{" "}
            {allRows.length === 1 ? "agendamento" : "agendamentos"}
            {term ? ` · "${term}"` : ""}
          </span>
        </div>
        {readOnlyReason === "cliente-admin" && (
          <p className="text-[12px] text-[color:var(--fg-subtle)] max-w-[680px] mt-1">
            Agendamentos são criados pela IA via fluxo do lead. A edição
            inline está desabilitada pra clientes pra evitar conflitos com
            automações de notificação. Para reagendar, fale com o vendedor
            responsável ou ajuste no CRM.
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
        <AgendamentosTable
          rows={allRows}
          isSuper={isSuper}
          canEdit={canEdit}
          readOnlyReason={readOnlyReason}
        />
      </section>
    </div>
  );
}
