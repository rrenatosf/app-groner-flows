"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clientes,
  emptyLoja,
  pickCanonicalLoja,
  type HorariosVendedor,
} from "@/lib/db/schema";
import type { WhatsappWebhook } from "@/lib/whatsapp/webhook";
import { isRecord, parseUazapiList } from "@/lib/uazapi/parse";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh, requireOwner, requireSuperadmin } from "@/lib/auth/guard";
import {
  createCliente,
  deleteCliente,
  updateCliente,
  updateClienteSenha,
} from "@/server/services/mutations";

export type CrmStatus = {
  id: string;
  nome: string;
  etapaId: string;
  etapaNome: string;
};

export type FetchCrmResult =
  | { ok: true; statusList: CrmStatus[]; raw: unknown }
  | { ok: false; error: string };

export type CrmConnectionInfo = {
  tenant: string;
  tenantNome: string;
  loja: string;
  usuario: string;
  email: string;
  matchesTenant: boolean;
};

export type ValidateCrmResult =
  | { ok: true; info: CrmConnectionInfo }
  | { ok: false; error: string };

export type CrmUsuario = {
  id: number;
  nome: string;
  email: string | null;
  celular: string | null;
  ativo: boolean;
};

export type FetchCrmUsuariosResult =
  | { ok: true; usuarios: CrmUsuario[] }
  | { ok: false; error: string };

export async function validateCrmConnectionAction(): Promise<ValidateCrmResult> {
  const session = requireOwner(await readSession());
  return doValidateCrmConnection(session.clienteId);
}

/** Valida conexão CRM de um cliente alvo (usado pelo superadmin
 *  editando outro tenant via modal de Clientes). */
export async function validateCrmConnectionForClienteAction(
  clienteId: number,
): Promise<ValidateCrmResult> {
  await requireSuperadmin(await readSession());
  return doValidateCrmConnection(clienteId);
}

async function doValidateCrmConnection(
  clienteId: number,
): Promise<ValidateCrmResult> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const url = `https://${cliente.crmTenant}.api.groner.app/api/conta/minhaConta`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (resp.status === 401) {
    return { ok: false, error: "Token inválido ou expirado (HTTP 401)." };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }

  const content = (raw as { Content?: Record<string, unknown> })?.Content ?? {};
  const tenantObj = (content as Record<string, unknown>).tenant as
    | Record<string, unknown>
    | undefined;
  const lojaObj = (content as Record<string, unknown>).loja as
    | Record<string, unknown>
    | undefined;

  const tenant = String(tenantObj?.identifier ?? "");
  const tenantNome = String(tenantObj?.name ?? "");
  const loja = String(lojaObj?.nome ?? "");
  const usuario = String((content as Record<string, unknown>).nome ?? "");
  const email = String((content as Record<string, unknown>).email ?? "");

  if (!tenant) {
    return { ok: false, error: "Resposta do CRM não trouxe tenant.identifier." };
  }

  return {
    ok: true,
    info: {
      tenant,
      tenantNome,
      loja,
      usuario,
      email,
      matchesTenant: tenant === cliente.crmTenant,
    },
  };
}

export type WhatsappInstancia = {
  id: string;
  /** Nome canonical da instância (formato `<tenant>--<canal>` no padrão
   *  Groner). É o que vai pra clientes.api_instancia_nome no banco. */
  nome: string;
  /** Nome amigável de exibição (geralmente só o sufixo "Canal 002"). */
  displayName: string;
  /** Telefone vinculado à instância no provedor (E.164 ou bruto). */
  telefone: string | null;
  /** Status reportado pelo provedor (connected / disconnected / etc). */
  status: string | null;
  baseUrl: string | null;
  token: string | null;
  raw: Record<string, unknown>;
};

export type FetchInstanciasResult =
  | { ok: true; instancias: WhatsappInstancia[] }
  | { ok: false; error: string };

export type WhatsappStatusResult =
  | {
      ok: true;
      status: string | null;
      owner: string | null;
      profileName: string | null;
      paircode: string | null;
      qrcode: string | null;
      raw: unknown;
    }
  | { ok: false; error: string };

// Tipos e defaults do webhook ficam em `@/lib/whatsapp/webhook` —
// `"use server"` só permite exportar funções async, não objetos.

export type FetchWebhooksResult =
  | { ok: true; webhooks: WhatsappWebhook[]; raw: unknown }
  | { ok: false; error: string };

/** Lista webhooks da instância (GET /webhook do Uazapi). */
export async function fetchWhatsappWebhooksForClienteAction(
  clienteId: number,
): Promise<FetchWebhooksResult> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  const baseUrl = (cliente.apiBaseUrl ?? "https://groner.uazapi.com").replace(
    /\/$/,
    "",
  );
  if (!cliente.apiToken)
    return { ok: false, error: "Token API não cadastrado." };
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/webhook`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        token: cliente.apiToken,
        Authorization: `Bearer ${cliente.apiToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no Uazapi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `Uazapi retornou HTTP ${resp.status}: ${t.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do Uazapi não é JSON válido." };
  }
  // Spec Uazapi diz "sempre array", mas Go retorna `null` quando vazio.
  const list = parseUazapiList(raw, ["webhooks", "data"]);
  const webhooks: WhatsappWebhook[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    webhooks.push({
      id: o.id ? String(o.id) : undefined,
      url: String(o.url ?? ""),
      enabled: Boolean(o.enabled ?? true),
      events: Array.isArray(o.events) ? o.events.map(String) : [],
      excludeMessages: Array.isArray(o.excludeMessages)
        ? o.excludeMessages.map(String)
        : [],
      addUrlEvents: Boolean(o.addUrlEvents ?? false),
      addUrlTypesMessages: Boolean(o.addUrlTypesMessages ?? false),
    });
  }
  return { ok: true, webhooks, raw };
}

/** Apaga um webhook na instância (POST /webhook com action=delete do Uazapi).
 *  Auth: superadmin. */
export async function deleteWhatsappWebhookForClienteAction(
  clienteId: number,
  webhookId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  const wid = String(webhookId ?? "").trim();
  if (!wid) return { ok: false, error: "ID do webhook ausente." };
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.apiToken)
    return { ok: false, error: "Token API não cadastrado." };
  const baseUrl = (cliente.apiBaseUrl ?? "https://groner.uazapi.com").replace(
    /\/$/,
    "",
  );

  let resp: Response;
  try {
    // Uazapi não tem DELETE /webhook/{id}. Spec oficial: POST /webhook com
    // { action:"delete", id } — outros campos ignorados pelo handler. Schema
    // declara `url` required, então mandamos placeholder pra passar validação.
    resp = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: cliente.apiToken,
        Authorization: `Bearer ${cliente.apiToken}`,
      },
      body: JSON.stringify({
        action: "delete",
        id: wid,
        url: "https://placeholder.invalid/",
      }),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no Uazapi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `Uazapi retornou HTTP ${resp.status}: ${t.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  return { ok: true };
}

/** Aplica/atualiza o webhook na instância (POST /webhook do Uazapi).
 *  Body base: addUrlEvents, addUrlTypesMessages, enabled, events,
 *  excludeMessages, url. Se `payload.id` presente, anexa
 *  `id` + `action: "update"` (modo avançado). */
export async function setWhatsappWebhookForClienteAction(
  clienteId: number,
  payload: WhatsappWebhook,
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.apiToken)
    return { ok: false, error: "Token API não cadastrado." };
  // Spec Uazapi declara `url` required. Bloqueia cedo com mensagem
  // útil em vez de deixar a Uazapi rejeitar com 400 cru.
  if (!payload.url || !payload.url.trim()) {
    return {
      ok: false,
      error: "URL do webhook ausente — recarregue a lista e tente de novo.",
    };
  }
  const baseUrl = (cliente.apiBaseUrl ?? "https://groner.uazapi.com").replace(
    /\/$/,
    "",
  );

  // UazAPI POST /webhook tem dois modos (per spec oficial):
  //  - Modo simples (sem id, sem action): cria/atualiza o único webhook da instância.
  //  - Modo avançado (com action): "add" cria, "update"+id atualiza, "delete"+id remove.
  // Mandar id sem action é caso indefinido na doc e provoca fail no toggle Ativo/Inativo.
  const body: Record<string, unknown> = {
    addUrlEvents: payload.addUrlEvents ?? false,
    addUrlTypesMessages: payload.addUrlTypesMessages ?? false,
    enabled: payload.enabled,
    events: payload.events,
    excludeMessages: payload.excludeMessages ?? [],
    url: payload.url,
  };
  if (payload.id) {
    body.id = payload.id;
    body.action = "update";
  }

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: cliente.apiToken,
        Authorization: `Bearer ${cliente.apiToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no Uazapi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `Uazapi retornou HTTP ${resp.status}: ${t.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    raw = null;
  }
  return { ok: true, raw };
}

/** Verifica o estado da instância WhatsApp cadastrada no cliente
 *  (usa apiToken + apiBaseUrl gravados, não a lista AWS). Endpoint
 *  Uazapi: GET /instance/status com header `token`. */
export async function checkWhatsappStatusForClienteAction(
  clienteId: number,
): Promise<WhatsappStatusResult> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  const baseUrl = (cliente.apiBaseUrl ?? "https://groner.uazapi.com").replace(
    /\/$/,
    "",
  );
  const token = cliente.apiToken;
  if (!token)
    return {
      ok: false,
      error: "Token API não cadastrado. Salve a aba WhatsApp primeiro.",
    };

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/instance/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        token,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no Uazapi: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `Uazapi retornou HTTP ${resp.status}: ${t.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do Uazapi não é JSON válido." };
  }
  // Spec: { instance:{...}, status:{connected,...} } como irmãos. Versões
  // antigas aninhavam tudo em `data`. Spread root primeiro, sub-objetos
  // por cima (mais específico vence) — evita override por null top-level.
  const root = isRecord(raw) ? raw : {};
  const instance = isRecord(root.instance) ? root.instance : null;
  const statusObj = isRecord(root.status) ? root.status : null;
  const data = isRecord(root.data) ? root.data : null;
  const obj: Record<string, unknown> = {
    ...root,
    ...(data ?? {}),
    ...(instance ?? {}),
    ...(statusObj ?? {}),
  };
  // Shape novo Uazapi entrega connected:boolean em vez de status:string.
  // Mapeia pra evitar pickStr devolver "true"/"false".
  const connectedFlag =
    statusObj && typeof statusObj.connected === "boolean"
      ? statusObj.connected
        ? "connected"
        : "disconnected"
      : null;
  function pickStr(...keys: string[]): string | null {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "boolean") continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return null;
  }
  return {
    ok: true,
    status: connectedFlag ?? pickStr("status", "connectionStatus"),
    owner: pickStr("owner", "phone", "phoneNumber", "wid", "number"),
    profileName: pickStr("profileName", "name", "instanceName"),
    paircode: pickStr("paircode", "pairingCode"),
    qrcode: pickStr("qrcode", "qrCode", "qr"),
    raw,
  };
}

/** Busca instâncias WhatsApp de um cliente específico (pelo id do banco).
 *  Usado no modal de cadastro de cliente onde session.clienteId !== alvo. */
export async function fetchWhatsappInstanciasForClienteAction(
  clienteId: number,
): Promise<FetchInstanciasResult> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  return doFetchInstancias(cliente);
}

/** Lista instâncias só pelo tenant (sem cliente cadastrado).
 *  Usado pelo modal de criação de novo cliente em /clientes.
 *  Gate: super-only. */
export async function fetchWhatsappInstanciasByTenantAction(
  tenant: string,
): Promise<FetchInstanciasResult> {
  await requireSuperadmin(await readSession());
  const trimmed = (tenant ?? "").trim();
  if (!trimmed) return { ok: false, error: "Informe o tenant antes de buscar." };
  // doFetchInstancias só usa cliente.crmTenant — synthesize minimal shape.
  return doFetchInstancias({ crmTenant: trimmed } as Awaited<
    ReturnType<typeof db.query.clientes.findFirst>
  >);
}

export async function fetchWhatsappInstanciasAction(): Promise<FetchInstanciasResult> {
  // Gate: apenas superadmin pode ler instâncias (a resposta inclui token
  // descriptografado da instância WhatsApp). Server-side, fresh DB lookup.
  const session = await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, session.clienteId),
  });
  return doFetchInstancias(cliente);
}

async function doFetchInstancias(
  cliente: Awaited<ReturnType<typeof db.query.clientes.findFirst>>,
): Promise<FetchInstanciasResult> {
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do cliente (crm_tenant) não configurado." };

  const devToken = process.env.GRONER_ZAP_DEV_TOKEN;
  if (!devToken) {
    return {
      ok: false,
      error: "GRONER_ZAP_DEV_TOKEN não configurado no servidor.",
    };
  }

  const baseUrl =
    process.env.GRONER_INSTANCES_URL ??
    "https://mm1963n7uj.execute-api.us-east-2.amazonaws.com/api/instances";
  const url = `${baseUrl}?tenant=${encodeURIComponent(cliente.crmTenant)}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-dev-token": devToken,
      },
      cache: "no-store",
      // Timeout de 15s — sem isso o fetch pendurava e o usuário ficava
      // olhando "Buscando..." infinito sem feedback.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const isAbort =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: isAbort
        ? "Timeout de 15s ao conectar na API Groner. O servidor de instâncias pode estar fora do ar."
        : `Falha ao conectar na API Groner: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `API retornou HTTP ${resp.status} ao listar instâncias: ${text.slice(0, 200) || "(sem corpo)"}`,
    };
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta da API não é JSON válido." };
  }

  // Shape esperado: array de {id, nome|name, baseUrl|host, token|apiToken, ...}
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] })?.data)
      ? ((raw as { data: unknown[] }).data)
      : Array.isArray((raw as { instances?: unknown[] })?.instances)
        ? ((raw as { instances: unknown[] }).instances)
        : [];

  const instancias: WhatsappInstancia[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    // Shape Groner: { name, instanceId, instanceName, decryptedToken,
    // token, serverDomain, tenant, phone | phoneNumber | wid, status, ... }
    const id = String(o.instanceId ?? o.id ?? o._id ?? o.uuid ?? "");
    // Nome canonical (vai pro banco): prefere instanceName/instance_name no
    // padrão "<tenant>--<canal>" sobre o name amigável.
    const nome = String(
      o.instanceName ?? o.instance_name ?? o.name ?? o.nome ?? "",
    );
    const displayName = String(o.name ?? o.nome ?? nome);
    const telefone = o.phone
      ? String(o.phone)
      : o.phoneNumber
        ? String(o.phoneNumber)
        : o.wid
          ? String(o.wid).replace(/@.*/, "")
          : o.number
            ? String(o.number)
            : null;
    const status =
      typeof o.status === "string"
        ? o.status
        : typeof o.connectionStatus === "string"
          ? o.connectionStatus
          : null;
    const token = o.decryptedToken
      ? String(o.decryptedToken)
      : o.token
        ? String(o.token)
        : null;
    // Uazapi tem endpoint único — não muda por tenant. Sempre retorna o
    // host fixo da API, independente do serverDomain do payload.
    const baseUrl = o.baseUrl
      ? String(o.baseUrl)
      : o.host
        ? String(o.host)
        : "https://groner.uazapi.com";
    instancias.push({
      id,
      nome,
      displayName,
      telefone,
      status,
      baseUrl,
      token,
      raw: o,
    });
  }

  // Enriquece com telefone real direto do provedor (Uazapi). O endpoint
  // de listagem AWS muitas vezes não traz o número conectado; o status
  // do Uazapi traz `owner` (número E.164) quando a instância está
  // conectada. Roda em paralelo, ignora erro silenciosamente.
  await Promise.allSettled(
    instancias.map(async (inst) => {
      if (!inst.token || !inst.baseUrl) return;
      try {
        const r = await fetch(`${inst.baseUrl}/instance/status`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            // Uazapi usa header `token` (não Authorization Bearer)
            token: inst.token,
          },
          cache: "no-store",
        });
        if (!r.ok) return;
        const j: unknown = await r.json().catch(() => null);
        if (!isRecord(j)) return;
        const instance = isRecord(j.instance) ? j.instance : null;
        const data = isRecord(j.data) ? j.data : null;
        const obj = (instance ?? data ?? j) as Record<string, unknown>;
        const owner =
          obj.owner ??
          obj.phone ??
          obj.phoneNumber ??
          obj.wid ??
          obj.number ??
          null;
        if (owner) {
          inst.telefone = String(owner).replace(/@.*/, "");
        }
        if (typeof obj.status === "string") {
          inst.status = obj.status;
        }
      } catch {
        // ignora — telefone fica como veio do listado AWS (ou null)
      }
    }),
  );

  return { ok: true, instancias };
}

/** Busca usuários do CRM de um cliente específico (pelo id no banco).
 *  Gate: superadmin. Usado no modal de cadastro de cliente. */
export async function fetchCrmUsuariosForClienteAction(
  clienteId: number,
): Promise<FetchCrmUsuariosResult> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM não configurado. Salve a aba Identidade primeiro." };
  return fetchCrmUsuariosViaToken(cliente.crmTenant, cliente.crmToken);
}

/** Busca lojas no CRM Groner pelo cliente. Tenta `/api/Loja` como endpoint
 *  comum. Gate: superadmin. */
export type CrmLoja = {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  /** Endereço concatenado (legado, mantido pra exibição rápida). */
  endereco: string | null;
  endereco_cep: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  raw: Record<string, unknown>;
};

export type FetchCrmLojasResult =
  | { ok: true; lojas: CrmLoja[] }
  | { ok: false; error: string };

export async function fetchCrmLojasForClienteAction(
  clienteId: number,
): Promise<FetchCrmLojasResult> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM não configurado. Salve a aba Identidade primeiro." };

  // pageSize alto pra trazer todas — o default do CRM Groner pagina
  // em ~5 itens. Sem isso o picker mostrava só as primeiras lojas.
  const url = `https://${cliente.crmTenant}.api.groner.app/api/Loja?pageNumber=1&pageSize=500&somenteAtivos=true`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }
  // Tenta achar lista — pode estar em Content / Content.list / array direto.
  const list: unknown[] = Array.isArray(raw)
    ? (raw as unknown[])
    : Array.isArray((raw as { Content?: unknown })?.Content)
      ? ((raw as { Content: unknown[] }).Content)
      : Array.isArray((raw as { Content?: { list?: unknown[] } })?.Content?.list)
        ? (raw as { Content: { list: unknown[] } }).Content.list
        : [];

  function pickStr(...vals: unknown[]): string | null {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return null;
  }

  const lojas: CrmLoja[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const enderecoObj =
      typeof o.endereco === "object" && o.endereco
        ? (o.endereco as Record<string, unknown>)
        : null;
    const enderecoStr = enderecoObj
      ? [
          enderecoObj.logradouro,
          enderecoObj.numero,
          enderecoObj.bairro,
          enderecoObj.cidade,
          enderecoObj.uf,
        ]
          .filter(Boolean)
          .join(", ")
      : (typeof o.endereco === "string" ? o.endereco : null);
    // Granular: tenta dentro de o.endereco (objeto) e cai pra raiz do CRM.
    const cep = pickStr(enderecoObj?.cep, o.cep);
    const rua = pickStr(enderecoObj?.logradouro, enderecoObj?.rua, o.logradouro, o.rua);
    const numero = pickStr(enderecoObj?.numero, o.numero);
    const bairro = pickStr(enderecoObj?.bairro, o.bairro);
    const cidadeEnd = pickStr(enderecoObj?.cidade, o.cidade);
    const estadoEnd = pickStr(enderecoObj?.uf, enderecoObj?.estado, o.uf, o.estado);
    const complemento = pickStr(enderecoObj?.complemento, o.complemento);
    lojas.push({
      id: String(o.id ?? o._id ?? ""),
      nome: String(o.nome ?? o.name ?? o.razaoSocial ?? ""),
      cnpj: o.cnpj ? String(o.cnpj) : null,
      telefone: o.telefone ? String(o.telefone) : null,
      endereco: enderecoStr,
      endereco_cep: cep,
      endereco_rua: rua,
      endereco_bairro: bairro,
      endereco_cidade: cidadeEnd,
      endereco_estado: estadoEnd,
      endereco_numero: numero,
      endereco_complemento: complemento,
      raw: o,
    });
  }
  return { ok: true, lojas };
}

async function fetchCrmUsuariosViaToken(
  tenant: string,
  crmToken: string,
): Promise<FetchCrmUsuariosResult> {
  const url = `https://${tenant}.api.groner.app/api/usuario?pageNumber=1&pageSize=200&somenteAtivos=true`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }
  const list = ((raw as { Content?: { list?: unknown[] } })?.Content?.list ??
    []) as unknown[];
  const usuarios: CrmUsuario[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    usuarios.push({
      id: Number(o.id ?? 0),
      nome: String(o.nome ?? ""),
      email: o.email ? String(o.email) : null,
      celular: o.celular ? String(o.celular) : null,
      ativo: Boolean(o.ativo),
    });
  }
  return { ok: true, usuarios };
}

/** Adiciona/substitui lojas selecionadas (do CRM) no cliente. */
export async function importLojasFromCrmAction(
  clienteId: number,
  lojasJson: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  let lojas: Array<{ nome: string; crm_id: string; area_atuacao?: number; consumo_minimo?: number; [k: string]: unknown }>;
  try {
    lojas = JSON.parse(lojasJson);
  } catch {
    return { ok: false, error: "JSON de lojas inválido." };
  }
  if (!Array.isArray(lojas)) {
    return { ok: false, error: "lojas deve ser array." };
  }
  // Normaliza com shape canonical completo via emptyLoja(). Tudo que vier
  // do CRM (cnpj/telefone/endereco_*) é mesclado por cima.
  // **Não** sobrescreve agenda_* / outros defaults se o payload veio sem
  // o campo ou com null/"" — preserva o default do emptyLoja().
  // Mapeia aliases legados (loja_cidade → endereco_cidade, loja_estado
  // → endereco_estado) pra shape canonical único.
  const ALIASES: Record<string, string> = {
    loja_cidade: "endereco_cidade",
    loja_estado: "endereco_estado",
  };
  const normalizadas = lojas.map((l) => {
    const base: Record<string, unknown> = emptyLoja();
    base.nome = String(l.nome ?? "");
    base.crm_id = String(l.crm_id ?? "");
    base.area_atuacao =
      typeof l.area_atuacao === "number" ? l.area_atuacao : 0;
    base.consumo_minimo =
      typeof l.consumo_minimo === "number" ? l.consumo_minimo : 0;
    for (const [rawKey, v] of Object.entries(l)) {
      if (["nome", "crm_id", "area_atuacao", "consumo_minimo"].includes(rawKey))
        continue;
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      const key = ALIASES[rawKey] ?? rawKey;
      base[key] = v;
    }
    // Reduz pro shape canonical estrito — descarta extras antigos.
    return pickCanonicalLoja(base);
  });
  // Merge com lojas atuais por crm_id — não sobrescreve as antigas. Sem isso,
  // cada save ia destruir a lista existente (jsonb REPLACE).
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const atuais = Array.isArray(cliente?.lojas)
    ? (cliente.lojas as Array<{ crm_id?: string; [k: string]: unknown }>)
    : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const l of atuais) {
    const id = String(l.crm_id ?? "");
    if (!id) continue;
    // Reduz lojas antigas ao shape canonical — extras / aliases legados
    // (loja_cidade, loja_estado etc) são descartados na re-gravação.
    const obj = l as Record<string, unknown>;
    if (obj.loja_cidade && !obj.endereco_cidade) {
      obj.endereco_cidade = obj.loja_cidade;
    }
    if (obj.loja_estado && !obj.endereco_estado) {
      obj.endereco_estado = obj.loja_estado;
    }
    byId.set(id, pickCanonicalLoja(obj));
  }
  for (const l of normalizadas) {
    const cid = String(l.crm_id ?? "");
    if (cid) byId.set(cid, l);
  }
  const merged = Array.from(byId.values());
  const { setClienteLojas } = await import("@/server/services/mutations");
  await setClienteLojas(clienteId, merged);
  revalidatePath("/clientes");
  return { ok: true, total: normalizadas.length };
}

/** Busca dados de UM usuário no CRM Groner por crmId. Endpoint:
 *  GET /api/usuario/{id}. Gate: superadmin. */
export async function fetchCrmUsuarioByCrmIdForClienteAction(
  clienteId: number,
  crmId: string,
): Promise<
  | { ok: true; usuario: CrmUsuario }
  | { ok: false; error: string }
> {
  await requireSuperadmin(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM não configurado." };
  if (!cliente.crmToken)
    return {
      ok: false,
      error: "Token do CRM não configurado.",
    };
  const url = `https://${cliente.crmTenant}.api.groner.app/api/usuario/${encodeURIComponent(crmId)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${t.slice(0, 200)}`,
    };
  }
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }
  // Shape Groner: { Content: { id, nome, email, celular, ativo, ... } }
  const obj =
    (typeof (raw as { Content?: unknown }).Content === "object" &&
      ((raw as { Content: Record<string, unknown> }).Content ?? null)) ||
    (raw as Record<string, unknown>);
  const o = obj as Record<string, unknown>;
  return {
    ok: true,
    usuario: {
      id: Number(o.id ?? 0),
      nome: String(o.nome ?? ""),
      email: o.email ? String(o.email) : null,
      celular: o.celular ? String(o.celular) : null,
      ativo: Boolean(o.ativo),
    },
  };
}

/** Edita campo único de vendedor pra um cliente alvo (cross-tenant). */
export async function updateUsuarioFieldForClienteAction(
  clienteId: number,
  usuarioId: number,
  field: "nome" | "email" | "telefone" | "crmId" | "role",
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  try {
    const { updateUsuarioField } = await import("@/server/services/mutations");
    await updateUsuarioField(clienteId, usuarioId, field, value);
    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao salvar campo.",
    };
  }
}

/** Adiciona usuários selecionados (do CRM) ao clientes.vendedores. */
export async function importUsuariosFromCrmAction(
  clienteId: number,
  usuariosJson: string,
  senhaPadrao: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  if (senhaPadrao.length < 6) {
    return {
      ok: false,
      error: "Senha padrão precisa de pelo menos 6 caracteres.",
    };
  }
  let usuarios: Array<{
    id: number;
    nome: string;
    email: string | null;
    celular: string | null;
    horarios?: HorariosVendedor;
  }>;
  try {
    usuarios = JSON.parse(usuariosJson);
  } catch {
    return { ok: false, error: "JSON de usuários inválido." };
  }
  if (!Array.isArray(usuarios)) {
    return { ok: false, error: "usuários deve ser array." };
  }
  const { createUsuario } = await import("@/server/services/mutations");
  let total = 0;
  for (const u of usuarios) {
    if (!u.email) continue;
    try {
      await createUsuario(clienteId, {
        nome: u.nome,
        email: u.email,
        senha: senhaPadrao,
        telefone: u.celular,
        crmId: String(u.id),
        role: "vendedor",
        recebeAgendamento: true,
        horarios: u.horarios && typeof u.horarios === "object" ? u.horarios : {},
      });
      total++;
    } catch {
      // duplicado de email — ignora
    }
  }
  revalidatePath("/clientes");
  return { ok: true, total };
}

export async function fetchCrmUsuariosAction(): Promise<FetchCrmUsuariosResult> {
  const session = requireOwner(await readSession());
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, session.clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM não configurado." };

  const url = `https://${cliente.crmTenant}.api.groner.app/api/usuario?pageNumber=1&pageSize=200&somenteAtivos=true`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }

  const list = ((raw as { Content?: { list?: unknown[] } })?.Content?.list ??
    []) as unknown[];

  const usuarios: CrmUsuario[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    usuarios.push({
      id: Number(o.id ?? 0),
      nome: String(o.nome ?? ""),
      email: o.email ? String(o.email) : null,
      celular: o.celular ? String(o.celular) : null,
      ativo: Boolean(o.ativo),
    });
  }

  return { ok: true, usuarios };
}

export async function fetchCrmFunisAction(): Promise<FetchCrmResult> {
  const session = requireOwner(await readSession());
  return doFetchCrmFunis(session.clienteId);
}

/** Versão pra superadmin: busca funis com token do cliente alvo,
 *  não do tenant da sessão. Sem isso o picker mostrava colunas da
 *  Looper enquanto editando outro cliente. */
export async function fetchCrmFunisForClienteAction(
  clienteId: number,
): Promise<FetchCrmResult> {
  await requireSuperadmin(await readSession());
  return doFetchCrmFunis(clienteId);
}

async function doFetchCrmFunis(clienteId: number): Promise<FetchCrmResult> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const url = `https://${cliente.crmTenant}.api.groner.app/api/statusProjeto/agrupadoPorEtapa`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return { ok: false, error: "Resposta do CRM não é JSON válido." };
  }

  const statusList: CrmStatus[] = [];
  // Shape real do Groner CRM: { Content: [ { etapa:{id,nome}, status:[{id,nome}] } ] }
  // Também aceita array plano como fallback.
  const rootArray: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.Content)
      ? ((raw as Record<string, unknown>).Content as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.content)
        ? ((raw as Record<string, unknown>).content as unknown[])
        : [];

  // Inclui (1) cada etapa como item selecionável e (2) cada status
  // filho. Algumas colunas do kanban são "etapas" raiz (ex: "Entrada
  // do Lead") sem status filho — sem isso elas não apareciam no picker.
  // Dedup por `id` global (id é único no CRM Groner) — evita listar
  // o mesmo status N vezes quando ele aparece em vários funis.
  const seenIds = new Set<string>();
  function pushItem(item: CrmStatus) {
    if (!item.id) return;
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    statusList.push(item);
  }

  for (const item of rootArray) {
    if (typeof item !== "object" || !item) continue;
    const o = item as Record<string, unknown>;
    const etapaObj =
      typeof o.etapa === "object" && o.etapa
        ? (o.etapa as Record<string, unknown>)
        : null;
    const etapaId = String(
      etapaObj?.id ?? o.etapaId ?? o.idEtapa ?? o.etapa_id ?? "",
    );
    const etapaNome = String(
      etapaObj?.nome ??
        o.etapaNome ??
        o.nomeEtapa ??
        (typeof o.etapa === "string" ? o.etapa : "") ??
        "",
    );

    // Etapa raiz como item — n8n / backend Groner aceita usar o id da
    // etapa quando o status filho não existe (caso "Entrada do Lead").
    if (etapaId) {
      pushItem({
        id: etapaId,
        nome: etapaNome || `Etapa ${etapaId}`,
        etapaId,
        etapaNome,
      });
    }

    const subList = (o.status ??
      o.statusProjeto ??
      o.lista ??
      o.itens ??
      []) as unknown[];
    if (Array.isArray(subList)) {
      for (const s of subList) {
        if (typeof s !== "object" || !s) continue;
        const ss = s as Record<string, unknown>;
        const sid = String(ss.id ?? ss.statusId ?? "");
        if (!sid) continue;
        pushItem({
          id: sid,
          nome: String(ss.nome ?? ss.nomeStatus ?? ss.titulo ?? ""),
          etapaId,
          etapaNome,
        });
      }
    }
  }

  return { ok: true, statusList, raw };
}

export type CreateClienteResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function deleteClienteAction(
  formData: FormData,
): Promise<{ ok: true; leads: number; agendamentos: number; agentes: number } | { ok: false; error: string }> {
  const session = await requireSuperadmin(await readSession());
  const id = Number(formData.get("clienteId"));
  if (!Number.isFinite(id)) return { ok: false, error: "clienteId inválido." };
  if (id === session.clienteId) {
    return { ok: false, error: "Você não pode remover o próprio cliente." };
  }
  try {
    const r = await deleteCliente(id);
    revalidatePath("/clientes");
    return {
      ok: true,
      leads: r.leadsRemovidos,
      agendamentos: r.agendamentosRemovidos,
      agentes: r.agentesRemovidos,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao remover.",
    };
  }
}

export async function createClienteAction(
  formData: FormData,
): Promise<CreateClienteResult> {
  await requireSuperadmin(await readSession());

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const crmTenant = String(formData.get("crmTenant") ?? "")
    .trim()
    .toLowerCase();

  if (!nome) return { ok: false, error: "Nome é obrigatório." };
  if (!email) return { ok: false, error: "E-mail é obrigatório." };
  if (senha.length < 6) {
    return { ok: false, error: "Senha deve ter ao menos 6 caracteres." };
  }
  if (!crmTenant) {
    return { ok: false, error: "Subdomínio (crm_tenant) é obrigatório." };
  }

  try {
    const id = await createCliente({
      nome,
      email,
      senha,
      crmTenant,
      telefone: orNull(formData.get("telefone")),
      crmToken: orNull(formData.get("crmToken")),
    });
    revalidatePath("/clientes");
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao criar cliente.",
    };
  }
}

/** Atualiza campos arbitrários de um cliente (subset).
 *  Gate: requireSuperadmin (cria/edita tenant é tarefa Groner). */
export async function updateClienteSecaoAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());
  const id = Number(formData.get("clienteId"));
  if (!Number.isFinite(id)) {
    return { ok: false, error: "clienteId inválido." };
  }

  function pick(name: string) {
    if (!formData.has(name)) return undefined;
    return orNull(formData.get(name));
  }

  // CRM status colunas: lê slots id_<slug> / nome_<slug> do FormData
  // (mesmo padrão do saveClienteAction). Só processa se o form trouxe
  // algum dos campos slot-shaped — assim outras seções (identidade,
  // whatsapp) não disparam reset acidental.
  type Tipo = "inicial" | "qualificacao" | "desqualificacao";
  const SLOTS: { slug: string; tipo: Tipo }[] = [
    { slug: "inicial", tipo: "inicial" },
    { slug: "qualificado", tipo: "qualificacao" },
    { slug: "area_atuacao", tipo: "desqualificacao" },
    { slug: "sem_resposta", tipo: "desqualificacao" },
    { slug: "sem_remarketing", tipo: "desqualificacao" },
    { slug: "consumo_insuficiente", tipo: "desqualificacao" },
    { slug: "fechou_c_concorrente", tipo: "desqualificacao" },
    { slug: "desqualificacao_geral", tipo: "desqualificacao" },
    { slug: "desqualificacao_outros", tipo: "desqualificacao" },
  ];
  const hasSlotData = SLOTS.some(
    (s) =>
      formData.has(`id_${s.slug}`) ||
      formData.has(`nome_${s.slug}`) ||
      formData.has(`notused_${s.slug}`),
  );
  type SlotShape = {
    nome: string;
    id: string;
    slug: string;
    tipo: Tipo;
    notUsed?: boolean;
  };
  let crmStatusColunas: SlotShape[] | null | undefined = undefined;
  if (hasSlotData) {
    const colunas: SlotShape[] = [];
    for (const s of SLOTS) {
      const slotId = String(formData.get(`id_${s.slug}`) ?? "").trim();
      const slotNome = String(formData.get(`nome_${s.slug}`) ?? "").trim();
      const slotNotUsed =
        String(formData.get(`notused_${s.slug}`) ?? "") === "1";
      if (!slotId && !slotNome && !slotNotUsed) continue;
      const slot: SlotShape = {
        nome: slotNome,
        id: slotId,
        slug: s.slug,
        tipo: s.tipo,
      };
      if (slotNotUsed) slot.notUsed = true;
      colunas.push(slot);
    }
    crmStatusColunas = colunas.length > 0 ? colunas : null;
  }

  try {
    await updateCliente(id, {
      nome: pick("nome"),
      email: pick("email"),
      telefone: pick("telefone"),
      apiToken: pick("apiToken"),
      apiInstanciaNome: pick("apiInstanciaNome"),
      apiBaseUrl: pick("apiBaseUrl"),
      crmToken: pick("crmToken"),
      crmTenant: pick("crmTenant"),
      crmOrigemId: pick("crmOrigemId"),
      crmStatusColunas,
    });
    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao salvar.",
    };
  }
}

function orNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export type CrmStatusWithWebhook = {
  id: string;
  nome: string;
  etapaId: string;
  etapaNome: string;
  webhookUrl: string;
};

export type FetchCrmStatusWithWebhookResult =
  | { ok: true; items: CrmStatusWithWebhook[]; total: number }
  | { ok: false; error: string };

/** Lista colunas (statusProjeto) do CRM do cliente que têm WebhookUrl
 *  configurado. Faz GET no listing agrupado, pra cada status faz GET
 *  individual em paralelo (limitado) e filtra os com webhookUrl não-vazio. */
export async function fetchCrmStatusWithWebhookAction(
  clienteId: number,
): Promise<FetchCrmStatusWithWebhookResult> {
  await requireSuperadmin(await readSession());

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return {
      ok: false,
      error: "Subdomínio do CRM (crm_tenant) não configurado.",
    };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const baseUrl = `https://${cliente.crmTenant}.api.groner.app/api`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${cliente.crmToken}`,
  };

  // 1) Lista o agrupamento pra descobrir todos os statusIds + nome/etapa.
  let listResp: Response;
  try {
    listResp = await fetch(`${baseUrl}/statusProjeto/agrupadoPorEtapa`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!listResp.ok) {
    const text = await listResp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${listResp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  const listRaw: unknown = await listResp.json().catch(() => null);
  if (!listRaw) return { ok: false, error: "Resposta do CRM não é JSON válido." };

  type Lite = { id: string; nome: string; etapaId: string; etapaNome: string };
  const seen = new Set<string>();
  const lites: Lite[] = [];
  const rootArray: unknown[] = Array.isArray(listRaw)
    ? listRaw
    : Array.isArray((listRaw as Record<string, unknown>)?.Content)
      ? ((listRaw as Record<string, unknown>).Content as unknown[])
      : Array.isArray((listRaw as Record<string, unknown>)?.content)
        ? ((listRaw as Record<string, unknown>).content as unknown[])
        : [];
  for (const item of rootArray) {
    if (typeof item !== "object" || !item) continue;
    const o = item as Record<string, unknown>;
    const etapaObj =
      typeof o.etapa === "object" && o.etapa
        ? (o.etapa as Record<string, unknown>)
        : null;
    const etapaId = String(
      etapaObj?.id ?? o.etapaId ?? o.idEtapa ?? o.etapa_id ?? "",
    );
    const etapaNome = String(
      etapaObj?.nome ??
        o.etapaNome ??
        o.nomeEtapa ??
        (typeof o.etapa === "string" ? o.etapa : "") ??
        "",
    );
    const subList = (o.status ??
      o.statusProjeto ??
      o.lista ??
      o.itens ??
      []) as unknown[];
    if (!Array.isArray(subList)) continue;
    for (const s of subList) {
      if (typeof s !== "object" || !s) continue;
      const ss = s as Record<string, unknown>;
      const sid = String(ss.id ?? ss.statusId ?? "");
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      lites.push({
        id: sid,
        nome: String(ss.nome ?? ss.nomeStatus ?? ss.titulo ?? ""),
        etapaId,
        etapaNome,
      });
    }
  }

  // 2) Pra cada status, GET individual em paralelo (chunks de 8).
  const items: CrmStatusWithWebhook[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < lites.length; i += CONCURRENCY) {
    const chunk = lites.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (lite) => {
        try {
          const r = await fetch(
            `${baseUrl}/statusProjeto/${encodeURIComponent(lite.id)}`,
            { method: "GET", headers, cache: "no-store" },
          );
          if (!r.ok) return null;
          const j = (await r.json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          if (!j) return null;
          const content =
            (j.Content as Record<string, unknown> | undefined) ??
            (j.content as Record<string, unknown> | undefined) ??
            j;
          const wh = String(
            (content?.webhookUrl as string | undefined) ??
              (content?.WebhookUrl as string | undefined) ??
              "",
          ).trim();
          if (!wh) return null;
          return { ...lite, webhookUrl: wh } satisfies CrmStatusWithWebhook;
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) items.push(r);
  }

  return { ok: true, items, total: lites.length };
}

export type CrmWebhookGlobalEntry = {
  /** Chave canônica do evento no CRM (ex: mensagemRecebidaUrl). */
  key: string;
  /** URL configurada (não-vazia). */
  url: string;
};

export type FetchCrmWebhookGlobalResult =
  | { ok: true; entries: CrmWebhookGlobalEntry[]; raw: unknown }
  | { ok: false; error: string };

/** Lista todos os eventos globais com webhook configurado.
 *  GET /api/configuracaoWebhook → varre o objeto retornado e devolve cada
 *  par chave/URL não-vazio. Auth: superadmin. */
export async function fetchCrmWebhookGlobalAction(
  clienteId: number,
): Promise<FetchCrmWebhookGlobalResult> {
  await requireSuperadmin(await readSession());

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const endpoint = `https://${cliente.crmTenant}.api.groner.app/api/configuracaoWebhook`;
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  const raw: unknown = await resp.json().catch(() => null);
  if (!raw) return { ok: false, error: "Resposta do CRM não é JSON válido." };

  // Shape pode vir como { Content: {...} } ou objeto plano. Varrer chaves
  // procurando strings não-vazias que pareçam URLs (terminadas em "Url").
  const obj =
    (raw as Record<string, unknown>)?.Content &&
    typeof (raw as Record<string, unknown>).Content === "object"
      ? ((raw as Record<string, unknown>).Content as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  const entries: CrmWebhookGlobalEntry[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (!/^https?:\/\//i.test(trimmed)) continue;
    entries.push({ key: k, url: trimmed });
  }
  return { ok: true, entries, raw };
}

/** Configura webhook global do CRM (mensagemRecebidaUrl).
 *  POST /api/configuracaoWebhook body { mensagemRecebidaUrl }.
 *  Auth: superadmin. Usa crmToken do cliente, não da sessão. */
export async function setCrmWebhookGlobalAction(
  clienteId: number,
  mensagemRecebidaUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());

  const url = String(mensagemRecebidaUrl ?? "").trim();
  if (!url) return { ok: false, error: "URL do webhook não pode ser vazia." };
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "URL do webhook inválida." };
  }

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const endpoint = `https://${cliente.crmTenant}.api.groner.app/api/configuracaoWebhook`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      body: JSON.stringify({ mensagemRecebidaUrl: url }),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  return { ok: true };
}

/** Apaga WebhookUrl de uma coluna (status) do CRM. Faz PUT com valor "".
 *  Auth: superadmin. */
export async function clearCrmStatusWebhookAction(
  clienteId: number,
  statusId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());

  const sid = String(statusId ?? "").trim();
  if (!sid) return { ok: false, error: "ID do status do CRM ausente." };

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const endpoint = `https://${cliente.crmTenant}.api.groner.app/api/statusProjeto/${encodeURIComponent(sid)}`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      body: JSON.stringify({ propriedade: "WebhookUrl", valor: "" }),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  return { ok: true };
}

/** Configura WebhookUrl em uma coluna (status) do CRM do cliente alvo.
 *  PUT /api/statusProjeto/{statusId} body { propriedade: "WebhookUrl", valor }.
 *  Auth: superadmin. Usa crmToken do cliente, não da sessão. */
export async function setCrmStatusWebhookAction(
  clienteId: number,
  statusId: string,
  webhookUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin(await readSession());

  const sid = String(statusId ?? "").trim();
  if (!sid) return { ok: false, error: "ID do status do CRM ausente." };
  const url = String(webhookUrl ?? "").trim();
  if (!url) return { ok: false, error: "URL do webhook não pode ser vazia." };
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "URL do webhook inválida." };
  }

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const endpoint = `https://${cliente.crmTenant}.api.groner.app/api/statusProjeto/${encodeURIComponent(sid)}`;
  const body = JSON.stringify({ propriedade: "WebhookUrl", valor: url });

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      body,
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  return { ok: true };
}

export type FetchCrmStatusWebhookByIdResult =
  | { ok: true; webhookUrl: string | null }
  | { ok: false; error: string };

/** GET /api/statusProjeto/{statusId} — retorna o WebhookUrl atual da
 *  coluna (ou null se vazio/ausente). Auth: superadmin. Usa crmToken
 *  do cliente alvo. */
export async function fetchCrmStatusWebhookByIdAction(
  clienteId: number,
  statusId: string,
): Promise<FetchCrmStatusWebhookByIdResult> {
  await requireSuperadmin(await readSession());

  const sid = String(statusId ?? "").trim();
  if (!sid) return { ok: false, error: "ID do status do CRM ausente." };

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };
  if (!cliente.crmTenant)
    return { ok: false, error: "Subdomínio do CRM (crm_tenant) não configurado." };
  if (!cliente.crmToken)
    return { ok: false, error: "Token do CRM (crm_token) não configurado." };

  const endpoint = `https://${cliente.crmTenant}.api.groner.app/api/statusProjeto/${encodeURIComponent(sid)}`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cliente.crmToken}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao conectar no CRM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `CRM retornou HTTP ${resp.status}: ${text.slice(0, 200) || "(corpo vazio)"}`,
    };
  }
  const j = (await resp.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!j) return { ok: false, error: "Resposta do CRM não é JSON válido." };
  const content =
    (j.Content as Record<string, unknown> | undefined) ??
    (j.content as Record<string, unknown> | undefined) ??
    j;
  const wh = String(
    (content?.webhookUrl as string | undefined) ??
      (content?.WebhookUrl as string | undefined) ??
      "",
  ).trim();
  return { ok: true, webhookUrl: wh.length > 0 ? wh : null };
}
