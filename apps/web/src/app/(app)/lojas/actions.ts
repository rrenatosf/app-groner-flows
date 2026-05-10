"use server";

import { eq, and, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  clientes,
  clientesAutomacoes,
  emptyLoja,
  pickCanonicalLoja,
  type Loja,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";

export type EditableLojaKey =
  | "nome"
  | "crm_id"
  | "cnpj"
  | "telefone"
  | "endereco"
  | "endereco_cep"
  | "endereco_rua"
  | "endereco_bairro"
  | "endereco_cidade"
  | "endereco_estado"
  | "endereco_numero"
  | "endereco_complemento"
  | "area_atuacao"
  | "consumo_minimo"
  | "agenda_qtd_slotes"
  | "agenda_qtd_turnos"
  | "agenda_dias_frente"
  | "agenda_tempo_slots"
  | "agenda_max_dias_fente"
  | "agenda_tempo_antecessor"
  | "agenda_tempo_antecedencia";

const NUMERIC_KEYS: ReadonlySet<EditableLojaKey> = new Set([
  "area_atuacao",
  "consumo_minimo",
]);

/** Whitelist do que o cliente comum (não-super) pode editar pela aba
 *  "Dados" da loja. Identificação (nome/CRM ID/CNPJ/telefone) e Agenda
 *  ficam fora — só super mexe, pra não quebrar workflow N8N e CRM
 *  externo. Endereço e regras (área de atuação / consumo mínimo) o
 *  cliente edita à vontade. */
const CLIENTE_ALLOWED: ReadonlySet<EditableLojaKey> = new Set([
  "endereco",
  "endereco_cep",
  "endereco_rua",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
  "endereco_numero",
  "endereco_complemento",
  "area_atuacao",
  "consumo_minimo",
]);

const TEXT_KEYS: ReadonlySet<EditableLojaKey> = new Set([
  "nome",
  "crm_id",
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
]);

export type UpdateLojaPartial = {
  [K in EditableLojaKey]?: string | number | null;
};

type Ok = { ok: true };
type Err = { ok: false; error: string };

/** Carrega cliente + valida acesso. Não-super só pode mexer no próprio
 *  cliente. Vendedor (kind=usuario) é read-only — bloqueado nas writes. */
async function loadAndAuthorize(
  clienteId: number,
): Promise<
  | { ok: true; cliente: typeof clientes.$inferSelect; isSuper: boolean }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor só pode visualizar." };
  }
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && clienteId !== session.clienteId) {
    return { ok: false, error: "Sem permissão pra editar este cliente." };
  }
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true, cliente, isSuper };
}

function findLojaIndex(lojas: Loja[], lojaId: string): number {
  return lojas.findIndex(
    (l) => typeof l.id === "string" && l.id === lojaId,
  );
}

/** Edição inline de uma célula. */
export async function updateLojaCell(
  clienteId: number,
  lojaId: string,
  key: EditableLojaKey,
  value: string | number | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const lojas: Loja[] = Array.isArray(auth.cliente.lojas)
    ? (auth.cliente.lojas as Loja[])
    : [];
  const idx = findLojaIndex(lojas, lojaId);
  if (idx < 0) return { ok: false, error: "Loja não encontrada." };

  if (!auth.isSuper && !CLIENTE_ALLOWED.has(key)) {
    return {
      ok: false,
      error: `Campo "${key}" só super pode editar. Solicite ao admin.`,
    };
  }

  const patch: Record<string, unknown> = {};
  if (NUMERIC_KEYS.has(key)) {
    const n =
      typeof value === "number"
        ? value
        : value === null || value === ""
          ? 0
          : Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Valor numérico inválido." };
    }
    patch[key] = n;
  } else if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: "Valor deve ser texto." };
    }
    const v = typeof value === "string" ? value.trim() : null;
    patch[key] = v === "" ? null : v;
  } else {
    return { ok: false, error: "Campo não editável." };
  }

  const next: Loja[] = lojas.map((l, i) =>
    i === idx ? ({ ...l, ...patch } as Loja) : l,
  );
  await db
    .update(clientes)
    .set({ lojas: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/lojas");
  return { ok: true };
}

/** Update batch via modal. */
export async function updateLojaFields(
  clienteId: number,
  lojaId: string,
  patch: UpdateLojaPartial,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const lojas: Loja[] = Array.isArray(auth.cliente.lojas)
    ? (auth.cliente.lojas as Loja[])
    : [];
  const idx = findLojaIndex(lojas, lojaId);
  if (idx < 0) return { ok: false, error: "Loja não encontrada." };

  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as EditableLojaKey;
    if (!auth.isSuper && !CLIENTE_ALLOWED.has(key)) {
      return {
        ok: false,
        error: `Campo "${key}" só super pode editar. Solicite ao admin.`,
      };
    }
    if (NUMERIC_KEYS.has(key)) {
      const n =
        typeof raw === "number"
          ? raw
          : raw === null || raw === undefined || raw === ""
            ? 0
            : Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) {
        return { ok: false, error: `Campo ${key}: numérico inválido.` };
      }
      writable[key] = n;
    } else if (TEXT_KEYS.has(key)) {
      if (typeof raw !== "string" && raw !== null && raw !== undefined) {
        return { ok: false, error: `Campo ${key}: texto inválido.` };
      }
      const v =
        raw === null || raw === undefined
          ? null
          : String(raw).trim() === ""
            ? null
            : String(raw).trim();
      writable[key] = v;
    }
  }

  if (Object.keys(writable).length === 0) return { ok: true };

  const next: Loja[] = lojas.map((l, i) =>
    i === idx ? ({ ...l, ...writable } as Loja) : l,
  );
  await db
    .update(clientes)
    .set({ lojas: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/lojas");
  return { ok: true };
}

export type CreateLojaInput = {
  nome: string;
  crm_id?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  endereco_cep?: string | null;
  endereco_rua?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  area_atuacao?: number | null;
  consumo_minimo?: number | null;
  agenda_qtd_slotes?: string | null;
  agenda_qtd_turnos?: string | null;
  agenda_dias_frente?: string | null;
  agenda_tempo_slots?: string | null;
  agenda_max_dias_fente?: string | null;
  agenda_tempo_antecessor?: string | null;
  agenda_tempo_antecedencia?: string | null;
};

/** Cria nova loja no cliente alvo. Server gera uuid via emptyLoja(). */
export async function createLoja(
  clienteId: number,
  input: CreateLojaInput,
): Promise<{ ok: true; id: string } | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;

  const nome = (input.nome ?? "").trim();
  if (nome.length === 0) return { ok: false, error: "Nome é obrigatório." };

  const fresh = emptyLoja();
  const trimOrNull = (v: string | null | undefined) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const numOrZero = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const agendaOrDefault = (
    v: string | null | undefined,
    fallback: string,
  ): string => {
    const t = typeof v === "string" ? v.trim() : "";
    return t.length > 0 ? t : fallback;
  };
  const novaLoja: Loja = {
    ...fresh,
    nome,
    crm_id: (input.crm_id ?? "").trim(),
    cnpj: trimOrNull(input.cnpj),
    telefone: trimOrNull(input.telefone),
    endereco_cep: trimOrNull(input.endereco_cep),
    endereco_rua: trimOrNull(input.endereco_rua),
    endereco_bairro: trimOrNull(input.endereco_bairro),
    endereco_cidade: trimOrNull(input.endereco_cidade),
    endereco_estado: trimOrNull(input.endereco_estado),
    endereco_numero: trimOrNull(input.endereco_numero),
    endereco_complemento: trimOrNull(input.endereco_complemento),
    area_atuacao: numOrZero(input.area_atuacao),
    consumo_minimo: numOrZero(input.consumo_minimo),
    agenda_qtd_slotes: agendaOrDefault(
      input.agenda_qtd_slotes,
      fresh.agenda_qtd_slotes ?? "",
    ),
    agenda_qtd_turnos: agendaOrDefault(
      input.agenda_qtd_turnos,
      fresh.agenda_qtd_turnos ?? "",
    ),
    agenda_dias_frente: agendaOrDefault(
      input.agenda_dias_frente,
      fresh.agenda_dias_frente ?? "",
    ),
    agenda_tempo_slots: agendaOrDefault(
      input.agenda_tempo_slots,
      fresh.agenda_tempo_slots ?? "",
    ),
    agenda_max_dias_fente: agendaOrDefault(
      input.agenda_max_dias_fente,
      fresh.agenda_max_dias_fente ?? "",
    ),
    agenda_tempo_antecessor: agendaOrDefault(
      input.agenda_tempo_antecessor,
      fresh.agenda_tempo_antecessor ?? "",
    ),
    agenda_tempo_antecedencia: agendaOrDefault(
      input.agenda_tempo_antecedencia,
      fresh.agenda_tempo_antecedencia ?? "",
    ),
  };

  const lojas: Loja[] = Array.isArray(auth.cliente.lojas)
    ? (auth.cliente.lojas as Loja[])
    : [];
  const next: Loja[] = [...lojas, novaLoja];
  await db
    .update(clientes)
    .set({ lojas: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/lojas");
  return { ok: true, id: novaLoja.id };
}

/** Remove loja por id. Bloqueia se houver automações vinculadas
 *  (mesmo cliente, mesma loja). UI/admin precisa mover/deletar
 *  as automações antes — evita órfãos no banco. */
export async function deleteLoja(
  clienteId: number,
  lojaId: string,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  if (!auth.isSuper) {
    return { ok: false, error: "Só super pode executar essa ação." };
  }
  const lojas: Loja[] = Array.isArray(auth.cliente.lojas)
    ? (auth.cliente.lojas as Loja[])
    : [];
  const idx = findLojaIndex(lojas, lojaId);
  if (idx < 0) return { ok: false, error: "Loja não encontrada." };

  // Cascade guard: instâncias de automações vinculadas bloqueiam.
  const [autoCount] = await db
    .select({ n: count() })
    .from(clientesAutomacoes)
    .where(
      and(
        eq(clientesAutomacoes.clienteId, clienteId),
        eq(clientesAutomacoes.lojaId, lojaId),
      ),
    );
  const n = Number(autoCount?.n ?? 0);
  if (n > 0) {
    return {
      ok: false,
      error: `Mover/deletar ${n} automaç${n === 1 ? "ão" : "ões"} antes de remover esta loja.`,
    };
  }

  const next = lojas.filter((_, i) => i !== idx);
  await db
    .update(clientes)
    .set({ lojas: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/lojas");
  return { ok: true };
}

/** Aplica shape canônico — preenche campos faltantes com defaults,
 *  descarta extras não-canônicos. Usado pra reparar drift detectado. */
export async function applyCanonicalShape(
  clienteId: number,
  lojaId: string,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  if (!auth.isSuper) {
    return { ok: false, error: "Só super pode executar essa ação." };
  }
  const lojas: Loja[] = Array.isArray(auth.cliente.lojas)
    ? (auth.cliente.lojas as Loja[])
    : [];
  const idx = findLojaIndex(lojas, lojaId);
  if (idx < 0) return { ok: false, error: "Loja não encontrada." };

  const canonical = pickCanonicalLoja(
    lojas[idx] as unknown as Record<string, unknown>,
  );
  const next: Loja[] = lojas.map((l, i) => (i === idx ? canonical : l));
  await db
    .update(clientes)
    .set({ lojas: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/lojas");
  return { ok: true };
}
