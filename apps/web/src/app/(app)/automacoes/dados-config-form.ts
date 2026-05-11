import type { CrmStatusTipo } from "@/lib/db/schema";
import type { DadosConfigGroup } from "./dados-config-shape";

/** Tipos suportados pelo form visual de configurações. Inferidos a partir
 *  do valor inicial — se o catálogo trazia `string`, o form mantém string;
 *  arrays vazios assumem string. Objetos aninhados recursivos = `object`
 *  (renderer recursivo). Array misto ainda cai em `unsupported`. */
export type FieldKind =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "array-string" }
  | { kind: "array-number" }
  | { kind: "object" }
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
    return { kind: "object" };
  }
  return {
    kind: "unsupported",
    reason: `Tipo "${typeof initial}" não suportado.`,
  };
}

/** Converte chave técnica (`loja_id`, `Email`) em rótulo amigável.
 *  Não normaliza acentos — o casing literal precisa ser preservado pra
 *  workflows N8N externos.
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
  object: 4,
  unsupported: 5,
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

/** Detecta objeto que representa um status do CRM. Pattern: tem ambos
 *  `crm_status_id` e `crm_etapa_id` no shape. Pickup distinto do
 *  `coluna_*` (que usa o NOME do grupo); aqui usa o SHAPE dos campos.
 *  Permite picker em objetos aninhados sem precisar batizar o grupo
 *  com prefixo `coluna_`. */
export function isCrmStatusObject(inner: Record<string, unknown>): boolean {
  return "crm_status_id" in inner && "crm_etapa_id" in inner;
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
 *  User input aceita 10 dígitos (DDD+8) OU 11 dígitos (DDD+9+8); o `9` extra
 *  é injetado se o usuário não digitou. Display do input usa o que ele
 *  digitou (10 ou 11), só a normalização pra storage adiciona o `9`. */
export const TELEFONE_BR_USER_LEN_MIN = 10;
export const TELEFONE_BR_USER_LEN_MAX = 11;
/** @deprecated mantido pra compat — use TELEFONE_BR_USER_LEN_MAX. */
export const TELEFONE_BR_USER_LEN = TELEFONE_BR_USER_LEN_MAX;
export const TELEFONE_BR_STORED_LEN = 13;

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Snake_case BR: minúsculas + dígitos + `_`. Começa por letra, sem `__`,
 *  sem `_` final. Vazio é inválido. Workflows N8N esperam chaves nesse
 *  formato — quebra de convenção pode quebrar o parse externo. */
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

export function isSnakeCase(s: string): boolean {
  if (s === "") return false;
  if (!SNAKE_CASE_RE.test(s)) return false;
  if (s.endsWith("_")) return false;
  if (s.includes("__")) return false;
  return true;
}

/** Converte string arbitrária → snake_case. Strip acentos (NFD), lowercase,
 *  troca não-alfanumérico por `_`, colapsa `_` repetidos, trim das pontas.
 *  Idempotente: `toSnakeCase(toSnakeCase(x)) === toSnakeCase(x)`. */
export function toSnakeCase(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Extrai dígitos do storage pra exibir ao user. Retorna sempre 11 dígitos
 *  (DDD + 9 + 8) — formato canônico exibido. Tolera storage curto (legado). */
export function fromTelefoneStored(stored: string): string {
  const d = digitsOnly(stored);
  if (d.length === TELEFONE_BR_STORED_LEN && d.startsWith("55")) {
    return d.slice(2);
  }
  return d.slice(-TELEFONE_BR_USER_LEN_MAX);
}

/** Monta storage E.164 BR a partir do que user digitou. Aceita 10 (DDD+8)
 *  ou 11 (DDD+9+8) dígitos. Se 10 e 3º dígito ≠ `9` (fixo legado), injeta
 *  `9` entre DDD e número. Se 10 e 3º dígito == `9`, está mid-typing
 *  móvel — retorna raw, sem injetar (evita comer último dígito quando o
 *  input controlado re-truncar). Se 11, prefixa `55`. Vazio retorna "". */
export function toTelefoneStored(userInput: string): string {
  const d = digitsOnly(userInput);
  if (d.length === 0) return "";
  if (d.length === TELEFONE_BR_USER_LEN_MIN) {
    // Móvel mid-typing (DDD + 9 + 7 dígitos): aguarda 11º. Não injeta.
    if (d.charAt(2) === "9") {
      return d;
    }
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    return `55${ddd}9${rest}`;
  }
  if (d.length === TELEFONE_BR_USER_LEN_MAX) {
    return `55${d}`;
  }
  return d;
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
  // `loja_id` no contexto N8N = CRM ID da loja (não UUID interno).
  // Workflow externo bate o lead pelo crm_id; UUID interno é detalhe
  // do nosso jsonb. Doc Notion "ID da loja no modal de automações"
  // (35c9084b98ef80b488b4f959bb0f7168).
  loja_id: (ctx) => ctx.loja?.crm_id ?? "",
  // `loja_id_interno` = UUID interno da loja (PK no DB Groner). Usado
  // quando workflow precisa identificar a loja por id interno em vez
  // de crm_id externo.
  loja_id_interno: (ctx) => String(ctx.lojaId ?? ""),
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

/** Aplica auto-fill em campos vazios recursivamente (objetos aninhados
 *  também). Não sobrescreve valor que o cliente já digitou. */
function autofillRecursive(
  inner: Record<string, unknown>,
  ctx: AutofillCtx,
): { value: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const out: Record<string, unknown> = { ...inner };
  for (const k of Object.keys(out)) {
    const fn = AUTOFILL_KEYS[k.toLowerCase()];
    if (fn) {
      const current = out[k];
      const isEmpty =
        current === "" || current === null || current === undefined;
      if (isEmpty) {
        const next = fn(ctx);
        if (next !== "") {
          out[k] = next;
          changed = true;
          continue;
        }
      }
    }
    const v = out[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const r = autofillRecursive(v as Record<string, unknown>, ctx);
      if (r.changed) {
        out[k] = r.value;
        changed = true;
      }
    }
  }
  return { value: out, changed };
}

export function autofillContextFields(
  cfg: import("./dados-config-shape").DadosConfigGroup[],
  ctx: AutofillCtx,
): import("./dados-config-shape").DadosConfigGroup[] {
  return cfg.map((g) => {
    const name = Object.keys(g)[0];
    if (!name) return g;
    const inner = g[name] as Record<string, unknown>;
    const r = autofillRecursive(inner, ctx);
    return r.changed
      ? ({
          [name]: r.value,
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
    case "object":
      // Considera objeto preenchido se TODOS os sub-campos não-vazios.
      // Contagem detalhada é feita por `countPendentesInner` recursivo.
      return false;
    case "unsupported":
      return false;
  }
}

/** Conta pendências dentro de um objeto interno (aplica recursão pra
 *  sub-objetos + atalho pra coluna_* group). */
function countPendentesInner(
  innerName: string,
  inner: Record<string, unknown>,
): number {
  if (isColunaGroup(innerName)) {
    const id = inner.id;
    return typeof id !== "string" || id.trim() === "" ? 1 : 0;
  }
  let n = 0;
  for (const [k, v] of Object.entries(inner)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      n += countPendentesInner(k, v as Record<string, unknown>);
      continue;
    }
    const kind = inferFieldKind(v);
    if (isFieldEmpty(v, kind)) n++;
  }
  return n;
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
    } else {
      n = countPendentesInner(
        groupName,
        groupValue as Record<string, unknown>,
      );
    }
    perGroup[groupName] = n;
    total += n;
  }
  return { total, perGroup };
}

/** Walk recursivo: true se houver algum grupo/subgrupo `coluna_*` em
 *  qualquer profundidade. Usado pra decidir se faz fetch live do CRM. */
export function hasColunaAnywhere(cfg: DadosConfigGroup[]): boolean {
  function walk(inner: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(inner)) {
      if (isColunaGroup(k)) return true;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        if (walk(v as Record<string, unknown>)) return true;
      }
    }
    return false;
  }
  for (const g of cfg) {
    const name = Object.keys(g)[0];
    if (!name) continue;
    if (isColunaGroup(name)) return true;
    const inner = g[name];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      if (walk(inner as Record<string, unknown>)) return true;
    }
  }
  return false;
}
