import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agendamentos,
  clientes,
  isPlaceholderVendedor,
  leads,
  type HorariosVendedor,
  type Vendedor,
} from "@/lib/db/schema";
import { camposFaltantesVendedor } from "@/lib/horarios";

export type UsuarioRow = {
  id: number;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  isActive: boolean | null;
  recebeAgendamento: boolean;
  role: "owner" | "vendedor";
  ultimoAgendamento: string | null;
  crmId: string | null;
  horarios: HorariosVendedor;
  camposFaltantes: string[];
  leadsRelacionados: number;
  leadsAbertos: number;
  leadsFinalizados: number;
  agendamentos: number;
  taxaConversao: number | null;
};

function matchesQuery(v: Vendedor, q?: string): boolean {
  if (!q || !q.trim()) return true;
  const term = q.trim().toLowerCase();
  return (
    (v.nome ?? "").toLowerCase().includes(term) ||
    (v.email ?? "").toLowerCase().includes(term) ||
    (v.telefone ?? "").toLowerCase().includes(term)
  );
}

export async function listUsuariosByCliente(
  clienteId: number,
  opts: { restrictToUserId?: number; q?: string } = {},
): Promise<UsuarioRow[]> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return [];

  const vendedores: Vendedor[] = Array.isArray(cliente.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];

  const filtered = vendedores.filter((v) => {
    // Esconde o placeholder canonical (id=0 / sem email) — existe só
    // pra ancorar o shape do jsonb no insert do cliente novo.
    if (isPlaceholderVendedor(v)) return false;
    if (opts.restrictToUserId && v.id !== opts.restrictToUserId) return false;
    if (!matchesQuery(v, opts.q)) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  // Agregações via SQL — contagem por vendedor_id
  const ids = filtered.map((v) => v.id);
  const totals = await db
    .select({
      vendedorId: leads.vendedorId,
      total: count(),
    })
    .from(leads)
    .where(
      and(
        eq(leads.clienteId, clienteId),
        inArray(leads.vendedorId, ids),
      ),
    )
    .groupBy(leads.vendedorId);

  const finalizados = await db
    .select({
      vendedorId: leads.vendedorId,
      total: count(),
    })
    .from(leads)
    .where(
      and(
        eq(leads.clienteId, clienteId),
        eq(leads.statusFollowup, "qualificado"),
        inArray(leads.vendedorId, ids),
      ),
    )
    .groupBy(leads.vendedorId);

  const ags = await db
    .select({
      vendedorId: leads.vendedorId,
      total: count(),
    })
    .from(agendamentos)
    .innerJoin(leads, eq(leads.id, agendamentos.leadId))
    .where(
      and(
        eq(leads.clienteId, clienteId),
        inArray(leads.vendedorId, ids),
      ),
    )
    .groupBy(leads.vendedorId);

  const totalsMap = new Map(totals.map((r) => [r.vendedorId ?? 0, r.total]));
  const finMap = new Map(finalizados.map((r) => [r.vendedorId ?? 0, r.total]));
  const agsMap = new Map(ags.map((r) => [r.vendedorId ?? 0, r.total]));

  return filtered.map((v) => {
    const totalLeads = totalsMap.get(v.id) ?? 0;
    const fin = finMap.get(v.id) ?? 0;
    const abertos = Math.max(totalLeads - fin, 0);
    const ag = agsMap.get(v.id) ?? 0;
    return {
      id: v.id,
      nome: v.nome,
      email: v.email,
      telefone: v.telefone,
      isActive: v.is_active,
      recebeAgendamento: v.recebe_agendamento,
      role: v.role === "owner" ? "owner" : "vendedor",
      ultimoAgendamento: v.ultimo_agendamento,
      crmId: v.crm_id,
      horarios: v.horarios ?? {},
      camposFaltantes: camposFaltantesVendedor(v),
      leadsRelacionados: totalLeads,
      leadsAbertos: abertos,
      leadsFinalizados: fin,
      agendamentos: ag,
      taxaConversao: totalLeads > 0 ? Math.round((fin / totalLeads) * 100) : null,
    };
  });
}

export async function findVendedorById(
  clienteId: number,
  vendedorId: number,
): Promise<Vendedor | null> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return null;
  const vendedores: Vendedor[] = Array.isArray(cliente.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];
  return vendedores.find((v) => v.id === vendedorId) ?? null;
}

export async function loadVendedores(clienteId: number): Promise<Vendedor[]> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const list = Array.isArray(cliente?.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];
  // Filtra o placeholder canonical (id=0 / sem email). Esse item existe
  // só pra ancorar o shape no jsonb e não deve aparecer em listagens.
  return list.filter((v) => !isPlaceholderVendedor(v));
}
