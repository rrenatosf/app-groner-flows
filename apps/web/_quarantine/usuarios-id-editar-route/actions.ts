"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clientes, type Vendedor } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh, requireOwner } from "@/lib/auth/guard";
import {
  setUsuarioHorarios,
  updateUsuario,
  updateUsuarioSenha,
} from "@/server/services/mutations";
import {
  DIAS_SEMANA,
  type DiaSemana,
  type HorariosVendedor,
  type IntervaloHorario,
} from "@/lib/db/schema";
import { isIntervaloValido } from "@/lib/horarios";

export async function saveUsuarioAction(
  usuarioId: number,
  formData: FormData,
) {
  const session = requireOwner(await readSession());

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!nome || !email) throw new Error("Nome e e-mail são obrigatórios.");

  const role = formData.get("role") === "owner" ? "owner" : "vendedor";

  // Superadmin pode editar vendedor de qualquer tenant. Cliente comum
  // só do próprio.
  let targetClienteId = session.clienteId;
  if (await isSuperadminFresh(session)) {
    const all = await db
      .select({ id: clientes.id, vendedores: clientes.vendedores })
      .from(clientes);
    const owner = all.find((c) => {
      const list = Array.isArray(c.vendedores)
        ? (c.vendedores as Vendedor[])
        : [];
      return list.some((v) => v.id === usuarioId);
    });
    if (owner) targetClienteId = owner.id;
  }

  await updateUsuario(targetClienteId, usuarioId, {
    nome,
    email,
    telefone: orNull(formData.get("telefone")),
    crmId: orNull(formData.get("crmId")),
    isActive: formData.get("isActive") === "on",
    role,
  });

  // Horários: ler intervalos por dia (formato horario_<dia>_<idx>_inicio/fim).
  const horarios: HorariosVendedor = {};
  for (const d of DIAS_SEMANA) {
    const intervalos: IntervaloHorario[] = [];
    let idx = 0;
    while (true) {
      const inicio = formData.get(`horario_${d.key}_${idx}_inicio`);
      const fim = formData.get(`horario_${d.key}_${idx}_fim`);
      if (inicio === null && fim === null) break;
      const i: IntervaloHorario = {
        inicio: String(inicio ?? ""),
        fim: String(fim ?? ""),
      };
      if (isIntervaloValido(i)) intervalos.push(i);
      idx++;
      if (idx > 50) break; // safety
    }
    if (intervalos.length > 0) horarios[d.key as DiaSemana] = intervalos;
  }
  await setUsuarioHorarios(targetClienteId, usuarioId, horarios);

  const novaSenha = String(formData.get("novaSenha") ?? "");
  if (novaSenha.length > 0) {
    if (novaSenha.length < 6) {
      throw new Error("Senha deve ter ao menos 6 caracteres.");
    }
    await updateUsuarioSenha(targetClienteId, usuarioId, novaSenha);
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}/editar`);
  redirect("/usuarios");
}

function orNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}
