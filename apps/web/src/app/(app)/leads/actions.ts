"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { clientes, leads, type Vendedor } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import {
  isClienteAdminReadOnly,
  isSuperadminFresh,
} from "@/lib/auth/guard";

/** Apenas estado interno do app — nada do CRM. Editar campos read-only
 *  cria drift que o webhook do CRM sobrescreve no próximo sync. */
export type EditableLeadKey =
  | "vendedorId"
  | "stepFollowup"
  | "statusFollowup"
  | "proximoFollowup";

const TEXT_KEYS: ReadonlySet<EditableLeadKey> = new Set(["statusFollowup"]);
const NUM_KEYS: ReadonlySet<EditableLeadKey> = new Set(["stepFollowup"]);
const DATETIME_KEYS: ReadonlySet<EditableLeadKey> = new Set([
  "proximoFollowup",
]);
const ASSIGN_KEYS: ReadonlySet<EditableLeadKey> = new Set(["vendedorId"]);

/** Campos que o vendedor logado (kind=usuario) pode editar nos próprios
 *  leads. Não pode trocar o vendedorId pra outro. */
const VENDEDOR_EDITABLE: ReadonlySet<EditableLeadKey> = new Set([
  "stepFollowup",
  "statusFollowup",
  "proximoFollowup",
]);

type Ok = { ok: true };
type Err = { ok: false; error: string };

type AuthOk = {
  ok: true;
  lead: typeof leads.$inferSelect;
  isSuper: boolean;
  isVendedor: boolean;
  clienteId: number;
};

async function loadAndAuthorize(leadId: number): Promise<AuthOk | Err> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
  });
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (lead.clienteId === null) {
    return { ok: false, error: "Lead sem cliente associado." };
  }

  const isSuper = await isSuperadminFresh(session);
  const isVendedor = session.kind === "usuario";

  // Cliente admin (kind=cliente, não super) é READ-ONLY em leads.
  // Edição de leads passa pelo CRM — defesa em profundidade contra
  // payload forjado via DevTools.
  if (isClienteAdminReadOnly(session, isSuper)) {
    return {
      ok: false,
      error: "Edição de leads desabilitada para clientes. Use o CRM.",
    };
  }

  if (!isSuper) {
    if (lead.clienteId !== session.clienteId) {
      return { ok: false, error: "Sem permissão pra editar este lead." };
    }
    if (isVendedor && lead.vendedorId !== session.userId) {
      return {
        ok: false,
        error: "Vendedor só pode editar os próprios leads.",
      };
    }
  }

  return {
    ok: true,
    lead,
    isSuper,
    isVendedor,
    clienteId: lead.clienteId,
  };
}

async function loadVendedorSnapshot(
  clienteId: number,
  vendedorId: number,
): Promise<Vendedor | null> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const list: Vendedor[] = Array.isArray(cliente?.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];
  const v = list.find((x) => x.id === vendedorId);
  if (!v) return null;
  // Snapshot remove senha — segurança do jsonb público.
  const { senha: _senha, ...rest } = v;
  return { ...rest, senha: null } as Vendedor;
}

/** Atualiza um único campo do lead (estado interno do app). Retorna
 *  resultado tipado. Vendedor logado só edita follow-up dos próprios. */
export async function updateLeadCell(
  leadId: number,
  key: EditableLeadKey,
  value: string | number | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(leadId);
  if (!auth.ok) return auth;

  if (auth.isVendedor && !VENDEDOR_EDITABLE.has(key)) {
    return {
      ok: false,
      error: "Vendedor só pode editar follow-up dos próprios leads.",
    };
  }

  if (ASSIGN_KEYS.has(key)) {
    // Atribuição: vendedorId pode ser null (libera) ou número.
    let vendedorId: number | null = null;
    if (value !== null && value !== "") {
      const n =
        typeof value === "number" ? value : Number(String(value));
      if (!Number.isFinite(n)) {
        return { ok: false, error: "vendedorId inválido." };
      }
      vendedorId = n;
    }
    let snapshot: Vendedor | null = null;
    if (vendedorId !== null) {
      snapshot = await loadVendedorSnapshot(auth.clienteId, vendedorId);
      if (!snapshot) {
        return { ok: false, error: "Vendedor não encontrado neste tenant." };
      }
    }
    await db
      .update(leads)
      .set({ vendedorId, vendedor: snapshot })
      .where(
        and(eq(leads.id, leadId), eq(leads.clienteId, auth.clienteId)),
      );
    revalidatePath("/leads");
    return { ok: true };
  }

  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    await db
      .update(leads)
      .set({ [key]: v === "" ? null : v })
      .where(
        and(eq(leads.id, leadId), eq(leads.clienteId, auth.clienteId)),
      );
    revalidatePath("/leads");
    return { ok: true };
  }

  if (NUM_KEYS.has(key)) {
    let n: number | null;
    if (value === null || value === "") n = null;
    else if (typeof value === "number") n = value;
    else {
      const parsed = Number(String(value).replace(",", "."));
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: `Campo ${key}: numérico inválido.` };
      }
      n = parsed;
    }
    await db
      .update(leads)
      .set({ [key]: n })
      .where(
        and(eq(leads.id, leadId), eq(leads.clienteId, auth.clienteId)),
      );
    revalidatePath("/leads");
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
      .update(leads)
      .set({ [key]: d })
      .where(
        and(eq(leads.id, leadId), eq(leads.clienteId, auth.clienteId)),
      );
    revalidatePath("/leads");
    return { ok: true };
  }

  return { ok: false, error: `Campo ${key}: não editável.` };
}

export type UpdateLeadPartial = {
  vendedorId?: number | null;
  stepFollowup?: number | null;
  statusFollowup?: string | null;
  proximoFollowup?: string | null;
};

/** Atualiza vários campos editáveis de um lead (usado pelo modal). */
export async function updateLeadFields(
  leadId: number,
  patch: UpdateLeadPartial,
): Promise<Ok | Err> {
  for (const [k, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const res = await updateLeadCell(
      leadId,
      k as EditableLeadKey,
      raw as string | number | boolean | null,
    );
    if (!res.ok) return res;
  }
  return { ok: true };
}

export type VendedorOption = {
  id: number;
  uid: string;
  nome: string;
  role: "owner" | "vendedor";
  is_active: boolean;
};

/** Lista vendedores do tenant pra atribuição. Inclui inativos com flag,
 *  pra UI poder mostrar mas não permitir selecionar. */
export async function listVendedoresParaLeadAction(
  clienteId: number,
): Promise<VendedorOption[]> {
  const session = await readSession();
  if (!session) return [];
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && session.clienteId !== clienteId) return [];

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const list: Vendedor[] = Array.isArray(cliente?.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];
  return list
    .filter((v) => typeof v.id === "number" && v.id > 0 && (v.email ?? "").trim() !== "")
    .map((v) => ({
      id: v.id,
      uid: v.uid,
      nome: v.nome ?? `Usuário #${v.id}`,
      role: v.role,
      is_active: v.is_active,
    }));
}
