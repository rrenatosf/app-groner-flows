"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { agentes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";

export type EditableAgenteKey =
  | "name"
  | "description"
  | "prompt"
  | "debounceTime"
  | "maxFollowups"
  | "humanIntervention"
  | "isActive"
  | "idN8n"
  | "voiceGender";

const TEXT_KEYS: ReadonlySet<EditableAgenteKey> = new Set([
  "name",
  "description",
  "prompt",
  "idN8n",
  "voiceGender",
]);
const NUM_KEYS: ReadonlySet<EditableAgenteKey> = new Set([
  "debounceTime",
  "maxFollowups",
]);
const BOOL_KEYS: ReadonlySet<EditableAgenteKey> = new Set([
  "humanIntervention",
  "isActive",
]);

export type UpdateAgentePartial = {
  [K in EditableAgenteKey]?: string | number | boolean | null;
};

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function loadAndAuthorize(
  agenteId: number,
): Promise<
  | { ok: true; agente: typeof agentes.$inferSelect; isSuper: boolean }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor só pode visualizar." };
  }
  const isSuper = await isSuperadminFresh(session);
  const agente = await db.query.agentes.findFirst({
    where: eq(agentes.id, agenteId),
  });
  if (!agente) return { ok: false, error: "Agente não encontrado." };
  if (!isSuper && agente.clienteId !== session.clienteId) {
    return { ok: false, error: "Sem permissão pra editar este agente." };
  }
  return { ok: true, agente, isSuper };
}

function coerceCell(
  key: EditableAgenteKey,
  value: string | number | boolean | null,
): { ok: true; v: unknown } | Err {
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    return { ok: true, v: v === "" ? null : v };
  }
  if (NUM_KEYS.has(key)) {
    const n =
      typeof value === "number"
        ? value
        : value === null || value === ""
          ? 0
          : Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) {
      return { ok: false, error: `Campo ${key}: numérico inválido.` };
    }
    return { ok: true, v: n };
  }
  if (BOOL_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: `Campo ${key}: booleano inválido.` };
    }
    return { ok: true, v: value };
  }
  return { ok: false, error: `Campo ${key}: não editável.` };
}

export async function updateAgenteCell(
  agenteId: number,
  key: EditableAgenteKey,
  value: string | number | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(agenteId);
  if (!auth.ok) return auth;
  const coerced = coerceCell(key, value);
  if (!coerced.ok) return coerced;
  await db
    .update(agentes)
    .set({ [key]: coerced.v })
    .where(eq(agentes.id, agenteId));
  revalidatePath("/agentes");
  revalidatePath(`/clientes/${auth.agente.clienteId}/agentes`);
  return { ok: true };
}

export async function updateAgenteFields(
  agenteId: number,
  patch: UpdateAgentePartial,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(agenteId);
  if (!auth.ok) return auth;
  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as EditableAgenteKey;
    const coerced = coerceCell(key, raw ?? null);
    if (!coerced.ok) return coerced;
    writable[key] = coerced.v;
  }
  if (Object.keys(writable).length === 0) return { ok: true };
  await db.update(agentes).set(writable).where(eq(agentes.id, agenteId));
  revalidatePath("/agentes");
  revalidatePath(`/clientes/${auth.agente.clienteId}/agentes`);
  return { ok: true };
}

export type CreateAgenteInput = {
  clienteId: number;
  name: string;
  description?: string | null;
  prompt?: string | null;
  debounceTime?: number;
  maxFollowups?: number;
  humanIntervention?: boolean;
  isActive?: boolean;
  idN8n?: string | null;
  voiceGender?: string | null;
};

export async function createAgente(
  input: CreateAgenteInput,
): Promise<{ ok: true; id: number } | Err> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor não pode criar agente." };
  }
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && input.clienteId !== session.clienteId) {
    return { ok: false, error: "Sem permissão pra criar agente neste cliente." };
  }
  const name = (input.name ?? "").trim();
  if (name.length === 0) return { ok: false, error: "Nome é obrigatório." };

  const [created] = await db
    .insert(agentes)
    .values({
      clienteId: input.clienteId,
      name,
      description: input.description?.trim() || null,
      prompt: input.prompt?.trim() || null,
      debounceTime: input.debounceTime ?? 10,
      maxFollowups: input.maxFollowups ?? 5,
      humanIntervention: input.humanIntervention ?? false,
      isActive: input.isActive ?? true,
      idN8n: input.idN8n?.trim() || null,
      voiceGender: input.voiceGender?.trim() || null,
    })
    .returning({ id: agentes.id });
  revalidatePath("/agentes");
  revalidatePath(`/clientes/${input.clienteId}/agentes`);
  return { ok: true, id: created.id };
}

export async function deleteAgente(agenteId: number): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(agenteId);
  if (!auth.ok) return auth;
  const clienteId = auth.agente.clienteId;
  await db.delete(agentes).where(eq(agentes.id, agenteId));
  revalidatePath("/agentes");
  revalidatePath(`/clientes/${clienteId}/agentes`);
  return { ok: true };
}
