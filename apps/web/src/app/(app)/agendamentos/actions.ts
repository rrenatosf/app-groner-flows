"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { agendamentos, leads } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import {
  isClienteAdminReadOnly,
  isSuperadminFresh,
} from "@/lib/auth/guard";

/** Apenas estado interno do agendamento. Lead, cliente e vendedor são
 *  read-only (vêm via flow de leads / IA). */
export type EditableAgendamentoKey =
  | "dataAgendamento"
  | "statusAgendamento"
  | "observacaoAgendamento";

const TEXT_KEYS: ReadonlySet<EditableAgendamentoKey> = new Set([
  "statusAgendamento",
  "observacaoAgendamento",
]);
const DATETIME_KEYS: ReadonlySet<EditableAgendamentoKey> = new Set([
  "dataAgendamento",
]);

type Ok = { ok: true };
type Err = { ok: false; error: string };

type AuthOk = {
  ok: true;
  agendamento: typeof agendamentos.$inferSelect;
  lead: typeof leads.$inferSelect | null;
  isSuper: boolean;
  isVendedor: boolean;
  clienteId: number;
};

async function loadAndAuthorize(agendamentoId: number): Promise<AuthOk | Err> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };

  const ag = await db.query.agendamentos.findFirst({
    where: eq(agendamentos.id, agendamentoId),
  });
  if (!ag) return { ok: false, error: "Agendamento não encontrado." };

  // Resolve lead → cliente. Agendamento sem lead não pode ser editado
  // pelo app (não tem como validar tenant).
  if (ag.leadId === null) {
    return { ok: false, error: "Agendamento sem lead associado." };
  }
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, ag.leadId),
  });
  if (!lead) {
    return { ok: false, error: "Lead do agendamento não existe." };
  }
  if (lead.clienteId === null) {
    return { ok: false, error: "Lead sem cliente associado." };
  }

  const isSuper = await isSuperadminFresh(session);
  const isVendedor = session.kind === "usuario";

  // Cliente admin (kind=cliente, não super) é READ-ONLY em agendamentos.
  // Reagendamento passa pelo vendedor responsável ou pelo CRM — defesa em
  // profundidade contra payload forjado via DevTools.
  if (isClienteAdminReadOnly(session, isSuper)) {
    return {
      ok: false,
      error:
        "Edição de agendamentos desabilitada para clientes. Fale com o vendedor responsável ou ajuste no CRM.",
    };
  }

  if (!isSuper) {
    if (lead.clienteId !== session.clienteId) {
      return {
        ok: false,
        error: "Sem permissão pra editar este agendamento.",
      };
    }
    if (isVendedor && lead.vendedorId !== session.userId) {
      return {
        ok: false,
        error: "Vendedor só pode editar agendamentos dos próprios leads.",
      };
    }
  }

  return {
    ok: true,
    agendamento: ag,
    lead,
    isSuper,
    isVendedor,
    clienteId: lead.clienteId,
  };
}

/** Atualiza um único campo do agendamento. Retorna resultado tipado. */
export async function updateAgendamentoCell(
  agendamentoId: number,
  key: EditableAgendamentoKey,
  value: string | number | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(agendamentoId);
  if (!auth.ok) return auth;

  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    await db
      .update(agendamentos)
      .set({ [key]: v === "" ? null : v })
      .where(eq(agendamentos.id, agendamentoId));
    revalidatePath("/agendamentos");
    return { ok: true };
  }

  if (DATETIME_KEYS.has(key)) {
    let d: Date | null = null;
    if (value !== null && value !== "") {
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: `Campo ${key}: data/hora inválida.` };
      }
      d = parsed;
    }
    await db
      .update(agendamentos)
      .set({ [key]: d })
      .where(eq(agendamentos.id, agendamentoId));
    revalidatePath("/agendamentos");
    return { ok: true };
  }

  return { ok: false, error: `Campo ${key}: não editável.` };
}

export type UpdateAgendamentoPartial = {
  dataAgendamento?: string | null;
  statusAgendamento?: string | null;
  observacaoAgendamento?: string | null;
};

/** Atualiza vários campos do agendamento (usado pelo modal). */
export async function updateAgendamentoFields(
  agendamentoId: number,
  patch: UpdateAgendamentoPartial,
): Promise<Ok | Err> {
  for (const [k, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const res = await updateAgendamentoCell(
      agendamentoId,
      k as EditableAgendamentoKey,
      raw as string | number | boolean | null,
    );
    if (!res.ok) return res;
  }
  return { ok: true };
}
