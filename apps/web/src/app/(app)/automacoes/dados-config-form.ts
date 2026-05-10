import type { CrmStatusTipo } from "@/lib/db/schema";
import type { DadosConfigGroup } from "./dados-config-shape";

/** Tipos suportados pelo form visual de configurações. Inferidos a partir
 *  do valor inicial — se o catálogo trazia `string`, o form mantém string;
 *  arrays vazios assumem string. Objeto aninhado e array misto caem no
 *  branch `unsupported` (mostra fallback no UI). */
export type FieldKind =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "array-string" }
  | { kind: "array-number" }
  | { kind: "unsupported"; reason: string };

export function inferFieldKind(initial: unknown): FieldKind {
  if (initial === null || initial === undefined) return { kind: "string" };
  if (typeof initial === "string") return { kind: "string" };
  if (typeof initial === "number") return { kind: "number" };
  if (typeof initial === "boolean") return { kind: "boolean" };
  if (Array.isArray(initial)) {
    if (initial.length === 0) return { kind: "array-string" };
    const allStr = initial.every((x) => typeof x === "string");
    if (allStr) return { kind: "array-string" };
    const allNum = initial.every((x) => typeof x === "number");
    if (allNum) return { kind: "array-number" };
    return {
      kind: "unsupported",
      reason: "Array com tipos mistos não suportado.",
    };
  }
  if (typeof initial === "object") {
    return { kind: "unsupported", reason: "Objeto aninhado não suportado." };
  }
  return {
    kind: "unsupported",
    reason: `Tipo "${typeof initial}" não suportado.`,
  };
}

/** Converte chave técnica (`loja_id`, `Email`) em rótulo amigável.
 *  Não normaliza acentos — o casing literal precisa ser preservado pra
 *  workflows N8N externos. */
/** Converte snake_case ou kebab-case → "Cada Palavra Capitalizada".
 *  Ex: `loja_id` → "Loja Id"; `crm_token` → "Crm Token";
 *      `email_cliente` → "Email Cliente". */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const KIND_ORDER: Record<FieldKind["kind"], number> = {
  string: 0,
  number: 1,
  boolean: 2,
  "array-string": 3,
  "array-number": 3,
  unsupported: 4,
};

/** Ordenação estável: string primeiro, depois number/boolean, depois
 *  arrays, depois unsupported. Mantém ordem original entre kinds iguais. */
export function sortFields<T extends { kind: FieldKind }>(fs: T[]): T[] {
  return fs
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ka = KIND_ORDER[a.f.kind.kind];
      const kb = KIND_ORDER[b.f.kind.kind];
      if (ka !== kb) return ka - kb;
      return a.i - b.i;
    })
    .map(({ f }) => f);
}

export function detectColunaTipo(groupName: string): CrmStatusTipo | null {
  if (groupName === "coluna_inicial") return "inicial";
  if (groupName === "coluna_qualificacao") return "qualificacao";
  if (groupName.startsWith("coluna_desqualificacao")) return "desqualificacao";
  return null;
}

export function isColunaGroup(groupName: string): boolean {
  return detectColunaTipo(groupName) !== null;
}

/** Heurística: detecta se grupo é o bloco de configurações do template
 *  (super-only, valores espelham catálogo). Nome exato. */
export function isTemplateConfigGroup(groupName: string): boolean {
  return groupName === "configuracoes_do_template";
}

/** Mapeia campos do grupo template → coluna do catálogo. */
export const TEMPLATE_CONFIG_FIELD_MAP: Record<
  string,
  "baseUrl" | "n8nWorkflowId"
> = {
  base_url: "baseUrl",
  workflow_id: "n8nWorkflowId",
};

/** Heurística: detecta se um campo representa telefone BR. Trigger pra
 *  renderizar TelefoneBRInput (formato E.164 BR com prefixo +55 9 fixo). */
export function isTelefoneField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("telefone") ||
    k.includes("whatsapp") ||
    k.includes("phone") ||
    k === "celular"
  );
}

/** Helpers E.164 BR: storage = "55" + DDD(2) + "9" + 8 dígitos = 13 chars.
 *  User input mostrado: DDD(2) + 8 = 10 dígitos. */
export const TELEFONE_BR_USER_LEN = 10;
export const TELEFONE_BR_STORED_LEN = 13;

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Extrai DDD+8 últimos dígitos do storage E.164 BR. Tolera storage curto
 *  (legado) — retorna últimos 10 dígitos. */
export function fromTelefoneStored(stored: string): string {
  const d = digitsOnly(stored);
  if (d.length === TELEFONE_BR_STORED_LEN && d.startsWith("55")) {
    return d.slice(2, 4) + d.slice(5, 13);
  }
  return d.slice(-TELEFONE_BR_USER_LEN);
}

/** Monta storage E.164 BR a partir de DDD+8 dígitos. Vazio retorna "". */
export function toTelefoneStored(userInput: string): string {
  const d = digitsOnly(userInput);
  if (d.length === 0) return "";
  if (d.length !== TELEFONE_BR_USER_LEN) return d;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  return `55${ddd}9${rest}`;
}

/** Mapeia nome de campo (case-insensitive) → função que extrai valor
 *  do contexto. Usado pra auto-preencher campos de configuração com
 *  dados que o sistema já tem. */
type AutofillCtx = {
  clienteId: number;
  lojaId: string | null;
  cliente?: {
    crmTenant?: string | null;
    crmToken?: string | null;
  } | null;
  loja?: {
    crm_id?: string | null;
  } | null;
};

const AUTOFILL_KEYS: Record<string, (ctx: AutofillCtx) => string> = {
  loja_id: (ctx) => ctx.lojaId ?? "",
  cliente_id: (ctx) => String(ctx.clienteId ?? ""),
  crm_loja_id: (ctx) => ctx.loja?.crm_id ?? "",
  crm_tenant: (ctx) => ctx.cliente?.crmTenant ?? "",
  crm_token: (ctx) => ctx.cliente?.crmToken ?? "",
};

/** Lista de chaves auto-preenchíveis (case-insensitive). */
export function isAutofillField(key: string): boolean {
  return key.toLowerCase() in AUTOFILL_KEYS;
}

/** Lista de chaves que contêm segredo (não exibir plain). */
export function isSecretField(key: string): boolean {
  return key.toLowerCase() === "crm_token";
}

/** Aplica auto-fill em campos vazios. Não sobrescreve valor que o
 *  cliente já digitou. */
export function autofillContextFields(
  cfg: import("./dados-config-shape").DadosConfigGroup[],
  ctx: AutofillCtx,
): import("./dados-config-shape").DadosConfigGroup[] {
  return cfg.map((g) => {
    const name = Object.keys(g)[0];
    if (!name) return g;
    const inner = { ...g[name] } as Record<string, unknown>;
    let changed = false;
    for (const k of Object.keys(inner)) {
      const fn = AUTOFILL_KEYS[k.toLowerCase()];
      if (!fn) continue;
      const current = inner[k];
      const isEmpty =
        current === "" || current === null || current === undefined;
      if (!isEmpty) continue;
      const next = fn(ctx);
      if (next === "") continue;
      inner[k] = next;
      changed = true;
    }
    return changed
      ? ({
          [name]: inner,
        } as import("./dados-config-shape").DadosConfigGroup)
      : g;
  });
}

/** Slugify simples pra nomes de coluna CRM. Lower + unaccent + only
 *  alphanumeric/hyphens. Anexa sufixo `tipo` no fim quando informado. */
export function slugifyFromNome(nome: string, tipo?: string): string {
  const base = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return tipo ? `coluna-${tipo}` : "coluna";
  return tipo ? `${base}-${tipo}` : base;
}

function isFieldEmpty(value: unknown, kind: FieldKind): boolean {
  switch (kind.kind) {
    case "string":
      return typeof value !== "string" || value.trim() === "";
    case "number":
      return value === null || value === undefined;
    case "boolean":
      return false;
    case "array-string":
    case "array-number":
      return (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.every((v) => v === "" || v === null || v === undefined)
      );
    case "unsupported":
      return false;
  }
}

/** Conta campos pendentes (vazios) por grupo. Pra grupos `coluna_*`,
 *  pendência é só `id` vazio (os outros 3 campos vêm preenchidos juntos
 *  via ColunaPicker). Pra grupos comuns, conta cada campo vazio. */
export function countPendentes(
  cfg: DadosConfigGroup[],
): { total: number; perGroup: Record<string, number> } {
  const perGroup: Record<string, number> = {};
  let total = 0;
  for (const groupObj of cfg) {
    const groupName = Object.keys(groupObj)[0];
    if (!groupName) continue;
    const groupValue = groupObj[groupName];
    if (!groupValue || typeof groupValue !== "object") continue;

    let n = 0;
    if (isTemplateConfigGroup(groupName)) {
      // Bloco super-only, auto-fill do catálogo: nunca conta pendência.
      n = 0;
    } else if (isColunaGroup(groupName)) {
      const id = (groupValue as Record<string, unknown>).id;
      if (typeof id !== "string" || id.trim() === "") n = 1;
    } else {
      for (const [, v] of Object.entries(
        groupValue as Record<string, unknown>,
      )) {
        const kind = inferFieldKind(v);
        if (isFieldEmpty(v, kind)) n++;
      }
    }
    perGroup[groupName] = n;
    total += n;
  }
  return { total, perGroup };
}
