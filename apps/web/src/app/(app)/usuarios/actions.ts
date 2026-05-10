"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  clientes,
  emptyVendedor,
  pickCanonicalVendedor,
  type HorariosVendedor,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { requireOwner, isSuperadminFresh } from "@/lib/auth/guard";
import {
  setUsuarioActive,
  setUsuarioRecebeAgendamento,
  updateUsuarioField,
  removeUsuario,
  countLeadsByVendedor,
} from "@/server/services/mutations";
import { loadVendedores } from "@/server/services/usuarios";
import type { ResultadoAgenda } from "@/lib/agenda";

// ─── Novo padrão tipado (alinhado com /clientes e /lojas) ──────────────

export type EditableVendedorKey =
  | "nome"
  | "email"
  | "telefone"
  | "senha"
  | "role"
  | "crm_id"
  | "is_active"
  | "recebe_agendamento";

const TEXT_KEYS: ReadonlySet<EditableVendedorKey> = new Set([
  "nome",
  "email",
  "telefone",
  "senha",
  "crm_id",
]);
const BOOL_KEYS: ReadonlySet<EditableVendedorKey> = new Set([
  "is_active",
  "recebe_agendamento",
]);

export type UpdateVendedorPartial = {
  [K in EditableVendedorKey]?: string | boolean | null;
} & {
  loja_ids?: string[];
  horarios?: HorariosVendedor;
};

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function loadAndAuthorize(
  clienteId: number,
): Promise<
  | { ok: true; cliente: typeof clientes.$inferSelect; isSuper: boolean; canEdit: boolean }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  const isSuper = await isSuperadminFresh(session);
  // Cliente kind cliente edita o próprio tenant. Vendedor com role
  // owner também pode editar (admin do tenant).
  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (
    session.kind === "cliente" &&
    clienteId === session.clienteId
  )
    canEdit = true;
  else if (session.kind === "usuario" && clienteId === session.clienteId) {
    // Verifica se o vendedor logado tem role=owner.
    const cli = await db.query.clientes.findFirst({
      where: eq(clientes.id, clienteId),
    });
    const me = (cli?.vendedores ?? []).find((v) => v.id === session.userId);
    if (me?.role === "owner") canEdit = true;
  }
  if (!canEdit) {
    return { ok: false, error: "Sem permissão pra editar usuários." };
  }
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true, cliente, isSuper, canEdit };
}

function findVendedor(vendedores: Vendedor[], uid: string): number {
  return vendedores.findIndex(
    (v) => typeof v.uid === "string" && v.uid === uid,
  );
}

function nextVendedorIdLocal(vendedores: Vendedor[]): number {
  const max = vendedores.reduce(
    (m, v) => (typeof v.id === "number" && v.id > m ? v.id : m),
    0,
  );
  return max + 1;
}

export async function updateVendedorCell(
  clienteId: number,
  vendedorUid: string,
  key: EditableVendedorKey,
  value: string | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const vendedores = Array.isArray(auth.cliente.vendedores)
    ? (auth.cliente.vendedores as Vendedor[])
    : [];
  const idx = findVendedor(vendedores, vendedorUid);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };

  const patch: Record<string, unknown> = {};
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: "Valor deve ser texto." };
    }
    const v = typeof value === "string" ? value.trim() : null;
    if (key === "senha") {
      if (v === null || v === "") return { ok: true }; // não sobrescreve com vazio
      if (v.length < 6) {
        return {
          ok: false,
          error: "Senha deve ter pelo menos 6 caracteres.",
        };
      }
      patch.senha = await bcrypt.hash(v, 10);
    } else if (key === "email" && v !== null) {
      patch.email = v.toLowerCase();
    } else {
      patch[key] = v === "" ? null : v;
    }
  } else if (BOOL_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: "Valor deve ser booleano." };
    }
    patch[key] = value;
  } else if (key === "role") {
    if (value !== "owner" && value !== "vendedor") {
      return { ok: false, error: "Role inválida." };
    }
    patch.role = value;
  } else {
    return { ok: false, error: "Campo não editável." };
  }

  // Validação: recebe_agendamento=true exige horários cadastrados.
  if (key === "recebe_agendamento" && patch.recebe_agendamento === true) {
    const h = vendedores[idx].horarios ?? {};
    const temIntervalo = Object.values(h).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    );
    if (!temIntervalo) {
      return {
        ok: false,
        error:
          'Configure ao menos 1 horário antes de marcar "Recebe agendamentos".',
      };
    }
  }

  const next: Vendedor[] = vendedores.map((v, i) =>
    i === idx ? ({ ...v, ...patch } as Vendedor) : v,
  );
  await db
    .update(clientes)
    .set({ vendedores: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateVendedorFields(
  clienteId: number,
  vendedorUid: string,
  patch: UpdateVendedorPartial,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const vendedores = Array.isArray(auth.cliente.vendedores)
    ? (auth.cliente.vendedores as Vendedor[])
    : [];
  const idx = findVendedor(vendedores, vendedorUid);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };

  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as keyof UpdateVendedorPartial;
    if (key === "loja_ids") {
      if (!Array.isArray(raw)) continue;
      writable.loja_ids = (raw as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      );
    } else if (key === "horarios") {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        writable.horarios = raw as HorariosVendedor;
      }
    } else if (TEXT_KEYS.has(key as EditableVendedorKey)) {
      if (typeof raw !== "string" && raw !== null && raw !== undefined)
        continue;
      const v =
        raw === null || raw === undefined
          ? null
          : String(raw).trim() === ""
            ? null
            : String(raw).trim();
      if (key === "senha") {
        if (v === null) continue;
        if (v.length < 6)
          return {
            ok: false,
            error: "Senha deve ter pelo menos 6 caracteres.",
          };
        writable.senha = await bcrypt.hash(v, 10);
      } else if (key === "email" && v !== null) {
        writable.email = v.toLowerCase();
      } else {
        writable[key as string] = v;
      }
    } else if (BOOL_KEYS.has(key as EditableVendedorKey)) {
      if (typeof raw !== "boolean") continue;
      writable[key as string] = raw;
    } else if (key === "role") {
      if (raw === "owner" || raw === "vendedor") writable.role = raw;
    }
  }

  if (Object.keys(writable).length === 0) return { ok: true };

  // Validação: vendedor com `recebe_agendamento=true` exige pelo menos
  // 1 intervalo cadastrado em algum dia. Bloqueia salvar pra evitar
  // vendedor "ativo pra atendimento" sem janela disponível.
  const merged = { ...vendedores[idx], ...writable } as Vendedor;
  if (merged.recebe_agendamento === true) {
    const h = merged.horarios ?? {};
    const temIntervalo = Object.values(h).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    );
    if (!temIntervalo) {
      return {
        ok: false,
        error:
          'Configure ao menos 1 horário antes de marcar "Recebe agendamentos". Use a aba Horários.',
      };
    }
  }

  const next: Vendedor[] = vendedores.map((v, i) =>
    i === idx ? ({ ...v, ...writable } as Vendedor) : v,
  );
  await db
    .update(clientes)
    .set({ vendedores: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/usuarios");
  return { ok: true };
}

export type CreateVendedorInput = {
  nome: string;
  email: string;
  telefone?: string | null;
  senha: string;
  role?: "owner" | "vendedor";
  loja_ids?: string[];
  crm_id?: string | null;
};

export async function createVendedorTyped(
  clienteId: number,
  input: CreateVendedorInput,
): Promise<{ ok: true; uid: string } | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;

  const nome = (input.nome ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const senha = (input.senha ?? "").trim();
  if (nome.length === 0) return { ok: false, error: "Nome obrigatório." };
  if (email.length === 0) return { ok: false, error: "E-mail obrigatório." };
  if (senha.length < 6) {
    return { ok: false, error: "Senha deve ter ao menos 6 caracteres." };
  }

  const vendedores = Array.isArray(auth.cliente.vendedores)
    ? (auth.cliente.vendedores as Vendedor[])
    : [];
  if (vendedores.some((v) => (v.email ?? "").toLowerCase() === email)) {
    return { ok: false, error: "E-mail já cadastrado neste tenant." };
  }
  const fresh = emptyVendedor();
  const novo: Vendedor = {
    ...fresh,
    id: nextVendedorIdLocal(vendedores),
    nome,
    email,
    senha: await bcrypt.hash(senha, 10),
    telefone: input.telefone?.trim() || null,
    role: input.role ?? "vendedor",
    is_active: true,
    recebe_agendamento: true,
    crm_id: input.crm_id?.trim() || null,
    loja_ids: Array.isArray(input.loja_ids) ? input.loja_ids : [],
  };
  await db
    .update(clientes)
    .set({ vendedores: [...vendedores, novo] })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/usuarios");
  return { ok: true, uid: novo.uid };
}

export async function deleteVendedor(
  clienteId: number,
  vendedorUid: string,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const vendedores = Array.isArray(auth.cliente.vendedores)
    ? (auth.cliente.vendedores as Vendedor[])
    : [];
  const idx = findVendedor(vendedores, vendedorUid);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };
  const next = vendedores.filter((_, i) => i !== idx);
  await db
    .update(clientes)
    .set({ vendedores: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function applyVendedorCanonicalShape(
  clienteId: number,
  vendedorUid: string,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) return auth;
  const vendedores = Array.isArray(auth.cliente.vendedores)
    ? (auth.cliente.vendedores as Vendedor[])
    : [];
  const idx = findVendedor(vendedores, vendedorUid);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };
  const canonical = pickCanonicalVendedor(
    vendedores[idx] as unknown as Record<string, unknown>,
  );
  const next: Vendedor[] = vendedores.map((v, i) =>
    i === idx ? canonical : v,
  );
  await db
    .update(clientes)
    .set({ vendedores: next })
    .where(eq(clientes.id, clienteId));
  revalidatePath("/usuarios");
  return { ok: true };
}

// ─── Actions legadas (formData-based) ──────────────────────────────────

export async function getDeletePreviewAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("id inválido");
  const totalLeads = await countLeadsByVendedor(session.clienteId, id);
  const vendedores = await loadVendedores(session.clienteId);
  const outros = vendedores
    .filter((v) => v.id !== id)
    .map((v) => ({
      id: v.id,
      nome: v.nome ?? `Usuário #${v.id}`,
      ativo: v.is_active,
    }));
  return { totalLeads, outros };
}

export async function toggleUsuarioActiveAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!Number.isFinite(id)) throw new Error("id inválido");
  await setUsuarioActive(session.clienteId, id, next);
  revalidatePath("/usuarios");
  revalidatePath("/dashboard");
}

export async function toggleUsuarioRecebeAgendamentoAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!Number.isFinite(id)) throw new Error("id inválido");
  await setUsuarioRecebeAgendamento(session.clienteId, id, next);
  revalidatePath("/usuarios");
}

export async function updateUsuarioFieldAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!Number.isFinite(id)) throw new Error("id inválido");
  if (!["nome", "email", "telefone", "crmId", "role"].includes(field)) {
    throw new Error(`Campo "${field}" não pode ser editado inline.`);
  }
  await updateUsuarioField(
    session.clienteId,
    id,
    field as "nome" | "email" | "telefone" | "crmId" | "role",
    value,
  );
  revalidatePath("/usuarios");
}

export async function removeUsuarioAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("id inválido");
  if (session.kind === "usuario" && id === session.userId) {
    throw new Error("Você não pode remover sua própria conta.");
  }

  // Reatribuição opcional: se transferToId presente, leads do removido vão
  // para esse vendedor. Se transferToId === "" (string vazia), liberar (null).
  let transferToId: number | null | undefined = undefined;
  if (formData.has("transferToId")) {
    const raw = String(formData.get("transferToId") ?? "");
    if (raw === "") transferToId = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error("ID de destino inválido.");
      transferToId = n;
    }
  }

  await removeUsuario(session.clienteId, id, { transferToId });
  revalidatePath("/usuarios");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

/** Verifica conexão e permissão Google Calendar do vendedor. Faz 2
 *  chamadas: A) GET no CRM pra obter refreshToken; B) GET no servidor
 *  groner calendar pra confirmar permissão. Auth: super OU admin do
 *  tenant alvo. */
export async function validateVendedorAgendaAction(
  clienteId: number,
  vendedorUid: string,
): Promise<ResultadoAgenda> {
  const auth = await loadAndAuthorize(clienteId);
  if (!auth.ok) {
    return {
      id: 0,
      email: null,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: auth.error,
    };
  }
  const cliente = auth.cliente;
  const vendedores = (cliente.vendedores ?? []) as Vendedor[];
  const v = vendedores.find((x) => x.uid === vendedorUid);
  if (!v) {
    return {
      id: 0,
      email: null,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "Vendedor não encontrado.",
    };
  }
  const email = (v.email ?? "").trim();
  if (!email) {
    return {
      id: v.id,
      email: null,
      conexao: "sem_email",
      permissao: "nao_aplica",
    };
  }
  const tenant = cliente.crmTenant;
  const crmToken = cliente.crmToken;
  if (!tenant || !crmToken) {
    return {
      id: v.id,
      email,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "CRM tenant ou token não configurado no cliente.",
    };
  }

  // A) Buscar refresh token via CRM
  let refreshToken: string | null = null;
  try {
    const url = `https://${tenant}.api.groner.app/api/Usuario/ObterDadosGoogle/${encodeURIComponent(email)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${crmToken}`,
      },
      cache: "no-store",
    });
    if (!resp.ok) {
      return {
        id: v.id,
        email,
        conexao: "erro",
        permissao: "nao_aplica",
        detail: `CRM HTTP ${resp.status}.`,
      };
    }
    const raw = (await resp.json()) as { Content?: { refreshToken?: string } };
    refreshToken = raw?.Content?.refreshToken ?? null;
    if (!refreshToken) {
      return {
        id: v.id,
        email,
        conexao: "nao_conectada",
        permissao: "nao_aplica",
      };
    }
  } catch (e) {
    return {
      id: v.id,
      email,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  // B) Tentar buscar eventos do calendar — conexão já está OK aqui
  try {
    const params = new URLSearchParams({
      refreshToken,
      calendarId: "primary",
      maxResults: "1",
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });
    const url = `https://googlecalendar.groner.app/${tenant}/calendar/events?${params.toString()}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (resp.ok) {
      return { id: v.id, email, conexao: "ok", permissao: "ok" };
    }
    if (resp.status === 401 || resp.status === 403) {
      const text = await resp.text().catch(() => "");
      return {
        id: v.id,
        email,
        conexao: "ok",
        permissao: "negada",
        detail: text.slice(0, 200) || `HTTP ${resp.status}`,
      };
    }
    const text = await resp.text().catch(() => "");
    const lower = text.toLowerCase();
    if (
      lower.includes("permission") ||
      lower.includes("permissão") ||
      lower.includes("scope") ||
      lower.includes("insufficient")
    ) {
      return {
        id: v.id,
        email,
        conexao: "ok",
        permissao: "negada",
        detail: text.slice(0, 200),
      };
    }
    return {
      id: v.id,
      email,
      conexao: "ok",
      permissao: "erro",
      detail: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      id: v.id,
      email,
      conexao: "ok",
      permissao: "erro",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
