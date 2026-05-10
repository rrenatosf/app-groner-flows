// Slugs fixos definidos no nosso lado. Cliente NÃO altera o slug.
// Slug é a chave estável usada no n8n / código para localizar a coluna no CRM.
// Tipo classifica a coluna em: inicial, qualificacao, desqualificacao.

import type { CrmStatusSlot, CrmStatusTipo } from "@/lib/db/schema";

export const STATUS_TIPOS = {
  INICIAL: "inicial",
  QUALIFICACAO: "qualificacao",
  DESQUALIFICACAO: "desqualificacao",
} as const;

export const STATUS_INICIAL_SLUG = "inicial";
export const STATUS_QUALIFICADO_SLUG = "qualificado";

/** Webhook default sugerido para o slot `inicial`. Outros slots começam
 *  com campo vazio no modal de confirmação. */
export const DEFAULT_CRM_WEBHOOK_URL =
  "https://webhooks.gronercrm.com.br/webhook/groner";

/** Webhook default sugerido para o slot `qualificacao`. */
export const DEFAULT_CRM_WEBHOOK_QUALIFICACAO_URL =
  "https://webhooks.gronercrm.com.br/webhook/etiqueta-cache";

/** Webhook global default — endpoint /api/configuracaoWebhook
 *  body { mensagemRecebidaUrl }. */
export const DEFAULT_CRM_WEBHOOK_GLOBAL_URL =
  "https://webhooks.gronercrm.com.br/webhook/aigronerzap";

export const DESQUALIFICADO_SLUGS = [
  { slug: "area_atuacao", labelDefault: "Área de atuação" },
  { slug: "sem_resposta", labelDefault: "Sem resposta" },
  { slug: "sem_remarketing", labelDefault: "Sem remarketing" },
  { slug: "consumo_insuficiente", labelDefault: "Consumo insuficiente" },
  { slug: "fechou_c_concorrente", labelDefault: "Fechou c/ concorrente" },
  { slug: "desqualificacao_geral", labelDefault: "Desqualificação geral" },
  { slug: "desqualificacao_outros", labelDefault: "Outros" },
] as const;

export type DesqualificadoSlug = (typeof DESQUALIFICADO_SLUGS)[number]["slug"];

const TIPOS_VALIDOS: ReadonlySet<CrmStatusTipo> = new Set([
  "inicial",
  "qualificacao",
  "desqualificacao",
]);

// Helpers de normalização — sempre retornar objetos na ordem nome → id → slug → tipo.

export function normalizeSlot(input: unknown): CrmStatusSlot | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const nome = String(o.nome ?? "");
  const id = String(o.id ?? "");
  const slug = String(o.slug ?? "");
  const tipoRaw = String(o.tipo ?? "");
  const notUsed = o.notUsed === true;
  if (!id && !nome && !slug) return null;
  if (!TIPOS_VALIDOS.has(tipoRaw as CrmStatusTipo)) return null;
  const out: CrmStatusSlot = { nome, id, slug, tipo: tipoRaw as CrmStatusTipo };
  if (notUsed) out.notUsed = true;
  return out;
}

export function normalizeSlotList(input: unknown): CrmStatusSlot[] {
  if (!Array.isArray(input)) return [];
  const out: CrmStatusSlot[] = [];
  for (const item of input) {
    const slot = normalizeSlot(item);
    if (slot) out.push(slot);
  }
  return out;
}

export function makeSlot(
  nome: string,
  id: string,
  slug: string,
  tipo: CrmStatusTipo,
): CrmStatusSlot {
  return { nome, id, slug, tipo };
}

export function findByTipo(
  list: CrmStatusSlot[],
  tipo: CrmStatusTipo,
): CrmStatusSlot | null {
  return list.find((s) => s.tipo === tipo) ?? null;
}

export function findBySlug(
  list: CrmStatusSlot[],
  slug: string,
): CrmStatusSlot | null {
  return list.find((s) => s.slug === slug) ?? null;
}

export function filterDesqualificacao(list: CrmStatusSlot[]): CrmStatusSlot[] {
  return list.filter((s) => s.tipo === "desqualificacao");
}

/**
 * Estrutura canonical dos 9 slots com `slug` e `tipo` preenchidos e
 * `nome`/`id` vazios. Usada como default no insert de cliente novo —
 * já grava o shape completo no banco e o admin só precisa preencher
 * nome+id depois (manualmente ou via "Buscar do CRM").
 */
export function defaultCrmStatusColunas(): CrmStatusSlot[] {
  const out: CrmStatusSlot[] = [
    { nome: "", id: "", slug: STATUS_INICIAL_SLUG, tipo: "inicial" },
    {
      nome: "",
      id: "",
      slug: STATUS_QUALIFICADO_SLUG,
      tipo: "qualificacao",
    },
  ];
  for (const d of DESQUALIFICADO_SLUGS) {
    out.push({ nome: "", id: "", slug: d.slug, tipo: "desqualificacao" });
  }
  return out;
}
