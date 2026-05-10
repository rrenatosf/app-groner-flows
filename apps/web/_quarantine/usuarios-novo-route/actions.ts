"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { requireOwner } from "@/lib/auth/guard";
import { createUsuario } from "@/server/services/mutations";
import { loadVendedores } from "@/server/services/usuarios";
import {
  DIAS_SEMANA,
  type DiaSemana,
  type HorariosVendedor,
  type IntervaloHorario,
} from "@/lib/db/schema";
import { isIntervaloValido } from "@/lib/horarios";

export type NewUsuarioState = {
  error?: string;
  values?: {
    nome: string;
    email: string;
    telefone: string;
    crmId: string;
    role: "owner" | "vendedor";
    recebeAgendamento: boolean;
  };
};

export async function createUsuarioAction(
  _prev: NewUsuarioState,
  formData: FormData,
): Promise<NewUsuarioState> {
  const session = requireOwner(await readSession());

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const telefone = String(formData.get("telefone") ?? "").trim();
  const crmId = String(formData.get("crmId") ?? "").trim();
  const role: "owner" | "vendedor" =
    formData.get("role") === "owner" ? "owner" : "vendedor";
  const recebeAgendamento = formData.get("recebeAgendamento") === "on";

  const values = {
    nome,
    email,
    telefone,
    crmId,
    role,
    recebeAgendamento,
  };

  if (!nome || !email || senha.length < 6) {
    return {
      error: "Nome, e-mail e senha (mín. 6 chars) são obrigatórios.",
      values,
    };
  }

  // Email único dentro do tenant — agora consulta no JSON
  const vendedores = await loadVendedores(session.clienteId);
  if (
    vendedores.some((v) => (v.email ?? "").toLowerCase() === email)
  ) {
    return {
      error: "Já existe um usuário com este e-mail neste tenant.",
      values,
    };
  }

  // Horários: intervalos por dia.
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
      if (idx > 50) break;
    }
    if (intervalos.length > 0) horarios[d.key as DiaSemana] = intervalos;
  }

  await createUsuario(session.clienteId, {
    nome,
    email,
    senha,
    telefone: telefone || null,
    crmId: crmId || null,
    role,
    recebeAgendamento,
    horarios,
  });

  revalidatePath("/usuarios");
  revalidatePath("/dashboard");
  redirect("/usuarios");
}
