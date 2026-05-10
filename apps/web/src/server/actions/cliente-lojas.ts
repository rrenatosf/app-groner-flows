"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  automacoes,
  clientes,
  emptyLoja,
  type Loja,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { requireOwner } from "@/lib/auth/guard";
import { setClienteLojas } from "@/server/services/mutations";

async function fetchLojas(clienteId: number): Promise<Loja[]> {
  const c = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  return Array.isArray(c?.lojas) ? (c.lojas as Loja[]) : [];
}

const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function parseExtraPairs(formData: FormData): Record<string, unknown> {
  const keys = formData.getAll("extra_key").map((v) => String(v));
  const values = formData.getAll("extra_value").map((v) => String(v));
  const out: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i].trim();
    if (!k) continue;
    if (FORBIDDEN_KEYS.has(k)) {
      throw new Error(
        `Nome de campo extra "${k}" é reservado e não pode ser usado.`,
      );
    }
    const raw = (values[i] ?? "").trim();
    // Tenta interpretar número/boolean; senão guarda como string
    let value: unknown = raw;
    if (raw === "true") value = true;
    else if (raw === "false") value = false;
    else if (raw !== "" && !Number.isNaN(Number(raw))) value = Number(raw);
    out[k] = value;
  }
  return out;
}

function readBaseFields(formData: FormData): {
  ok: true;
  loja: Loja;
} | { ok: false; error: string } {
  const nome = String(formData.get("nome") ?? "").trim();
  const crmId = String(formData.get("crm_id") ?? "").trim();
  const area = Number(formData.get("area_atuacao") ?? "0");
  const consumo = Number(formData.get("consumo_minimo") ?? "0");
  if (!nome) return { ok: false, error: "Nome da loja é obrigatório." };
  if (!Number.isFinite(area) || area < 0 || area > 500)
    return {
      ok: false,
      error: "Área de atuação inválida (use 0–500 km).",
    };
  if (!Number.isFinite(consumo) || consumo < 0 || consumo > 100000)
    return {
      ok: false,
      error: "Consumo mínimo inválido (use 0–100000).",
    };

  // Base: shape canonical completo (com defaults agenda_* já preenchidos).
  const loja: Loja = {
    ...emptyLoja(),
    nome,
    crm_id: crmId,
    area_atuacao: area,
    consumo_minimo: consumo,
  };

  // Sobrescreve só os campos que vieram preenchidos no form. Campo
  // ausente ou string vazia preserva o default de emptyLoja() — assim
  // os agenda_* continuam com defaults canonical mesmo se o form não
  // tem inputs pra eles.
  const TEXT_FIELDS = [
    "cnpj",
    "telefone",
    "endereco",
    "endereco_cep",
    "endereco_rua",
    "endereco_bairro",
    "endereco_cidade",
    "endereco_estado",
    "endereco_numero",
    "endereco_complemento",
    "agenda_qtd_slotes",
    "agenda_qtd_turnos",
    "agenda_dias_frente",
    "agenda_tempo_slots",
    "agenda_max_dias_fente",
    "agenda_tempo_antecessor",
    "agenda_tempo_antecedencia",
  ] as const;
  for (const name of TEXT_FIELDS) {
    if (!formData.has(name)) continue;
    const v = String(formData.get(name) ?? "").trim();
    if (v.length === 0) continue;
    (loja as Record<string, unknown>)[name] = v;
  }

  Object.assign(loja, parseExtraPairs(formData));

  return { ok: true, loja };
}

// Todas as actions de loja exigem kind=cliente (admin do tenant). requireOwner
// já bloqueia kind=usuario com ForbiddenError, então mesmo que a UI escape
// e renderize botões, a server action recusa.
export async function addLojaAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const parsed = readBaseFields(formData);
  if (!parsed.ok) throw new Error(parsed.error);
  const lojas = await fetchLojas(session.clienteId);
  lojas.push(parsed.loja);
  await setClienteLojas(session.clienteId, lojas);
  revalidatePath("/clientes");
  revalidatePath("/lojas");
  revalidatePath("/perfil");
}

export async function updateLojaAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const index = Number(formData.get("index"));
  if (!Number.isFinite(index)) throw new Error("Índice inválido.");
  const parsed = readBaseFields(formData);
  if (!parsed.ok) throw new Error(parsed.error);
  const lojas = await fetchLojas(session.clienteId);
  if (index < 0 || index >= lojas.length) throw new Error("Loja não encontrada.");
  lojas[index] = parsed.loja;
  await setClienteLojas(session.clienteId, lojas);
  revalidatePath("/clientes");
  revalidatePath("/lojas");
}

// Edit inline por célula da tabela.
// Recebe { index, field, value }. Aceita campos reservados (numéricos) e extras (livres).
export async function updateLojaFieldAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const index = Number(formData.get("index"));
  const field = String(formData.get("field") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "");

  if (!Number.isFinite(index)) throw new Error("Índice inválido.");
  if (!field) throw new Error("Campo não informado.");

  const lojas = await fetchLojas(session.clienteId);
  if (index < 0 || index >= lojas.length) throw new Error("Loja não encontrada.");

  const target = { ...lojas[index] } as Record<string, unknown>;

  if (field === "nome" || field === "crm_id") {
    target[field] = rawValue;
  } else if (
    field === "cnpj" ||
    field === "telefone" ||
    field === "endereco"
  ) {
    target[field] = rawValue.trim() || null;
  } else if (field === "area_atuacao" || field === "consumo_minimo") {
    const num = Number(rawValue);
    const max = field === "area_atuacao" ? 500 : 100000;
    if (!Number.isFinite(num) || num < 0 || num > max) {
      throw new Error(
        `Valor inválido para ${field} (use 0–${max}).`,
      );
    }
    target[field] = num;
  } else {
    if (FORBIDDEN_KEYS.has(field)) {
      throw new Error(
        `Nome de campo extra "${field}" é reservado e não pode ser usado.`,
      );
    }
    // Extra — interpreta number/boolean/string igual em parseExtraPairs
    let parsed: unknown = rawValue;
    if (rawValue === "true") parsed = true;
    else if (rawValue === "false") parsed = false;
    else if (rawValue !== "" && !Number.isNaN(Number(rawValue))) {
      parsed = Number(rawValue);
    }
    if (rawValue === "") delete target[field];
    else target[field] = parsed;
  }

  lojas[index] = target as Loja;
  await setClienteLojas(session.clienteId, lojas);
  revalidatePath("/clientes");
  revalidatePath("/lojas");
}

export async function removeLojaAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const index = Number(formData.get("index"));
  if (!Number.isFinite(index)) throw new Error("Índice inválido.");
  const lojas = await fetchLojas(session.clienteId);
  if (index < 0 || index >= lojas.length) throw new Error("Loja não encontrada.");

  // Cascade guard: bloqueia se houver automações vinculadas à loja.
  const target = lojas[index];
  if (target?.id) {
    const [autoCount] = await db
      .select({ n: count() })
      .from(automacoes)
      .where(
        and(
          eq(automacoes.clienteId, session.clienteId),
          eq(automacoes.lojaId, target.id),
        ),
      );
    const n = Number(autoCount?.n ?? 0);
    if (n > 0) {
      throw new Error(
        `Mover/deletar ${n} automaç${n === 1 ? "ão" : "ões"} antes de remover esta loja.`,
      );
    }
  }

  lojas.splice(index, 1);
  await setClienteLojas(session.clienteId, lojas);
  revalidatePath("/clientes");
  revalidatePath("/lojas");
}
