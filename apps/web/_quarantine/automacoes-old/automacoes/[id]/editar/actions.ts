"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh, requireOwner } from "@/lib/auth/guard";
import { updateAgente } from "@/server/services/mutations";

export async function saveAgenteAction(
  agenteId: number,
  formData: FormData,
) {
  const session = requireOwner(await readSession());

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome é obrigatório.");

  // Superadmin edita agente de qualquer tenant — resolve o clienteId
  // real do agente. Cliente comum só edita do próprio.
  let targetClienteId = session.clienteId;
  if (await isSuperadminFresh(session)) {
    const owner = await db
      .select({ clienteId: agentes.clienteId })
      .from(agentes)
      .where(eq(agentes.id, agenteId))
      .limit(1);
    if (owner.length === 0) throw new Error("Agente não encontrado.");
    targetClienteId = owner[0].clienteId;
  }

  await updateAgente(targetClienteId, agenteId, {
    name,
    description: orNull(formData.get("description")),
    prompt: orNull(formData.get("prompt")),
    debounceTime: numberOr(formData.get("debounceTime"), 10),
    maxFollowups: numberOr(formData.get("maxFollowups"), 5),
    humanIntervention: formData.get("humanIntervention") === "on",
    isActive: formData.get("isActive") === "on",
    voiceGender: orNull(formData.get("voiceGender")),
    idN8n: orNull(formData.get("idN8n")),
  });

  revalidatePath("/automacoes");
  revalidatePath(`/automacoes/${agenteId}`);
  revalidatePath("/prompts");
  revalidatePath(`/prompts/${agenteId}`);
  redirect("/automacoes");
}

function orNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numberOr(v: FormDataEntryValue | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
