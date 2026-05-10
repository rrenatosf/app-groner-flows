/** Shape de cada item do array `dados_configuracoes`: objeto com
 *  EXATAMENTE 1 chave string cujo valor é outro objeto.
 *
 *  Casing literal — não normalizar (acentos + maiúsculas preservados pra
 *  compatibilidade com workflows N8N externos que consomem o JSON cru). */
export type DadosConfigGroup = Record<string, Record<string, unknown>>;

/** Limites de sanidade — impedem JSON gigante de virar foot-gun
 *  (rerender lento, payload pesado em writes, abuse). Valores alinhados
 *  com doc Notion "Tabelas de Automações" (15 grupos / 30 campos). */
export const MAX_GRUPOS = 15;
export const MAX_CAMPOS_POR_GRUPO = 30;
export const MAX_ARRAY_LEN = 50;
// 4000 cobre prompts N8N típicos (~1500-2000 chars) com folga.
export const MAX_STRING_LEN = 4000;

type Err = { ok: false; error: string };

/** Valida que o input é um array onde cada item é um objeto com
 *  exatamente 1 chave string cujo valor é outro objeto. Retorna
 *  o array tipado ou um erro descritivo.
 *
 *  Helper puro (sem `"use server"`) — usado tanto no server (actions)
 *  quanto no client (validação visual em modais antes do submit). */
export function validateDadosConfiguracoes(
  raw: unknown,
): { ok: true; v: DadosConfigGroup[] } | Err {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "dados_configuracoes deve ser um array." };
  }
  if (raw.length > MAX_GRUPOS) {
    return {
      ok: false,
      error: `Limite excedido: até ${MAX_GRUPOS} grupos por automação (recebidos ${raw.length}). Sistema precisa ser ajustado pra suportar mais — fale com o time de dev.`,
    };
  }
  const out: DadosConfigGroup[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        error: `Item ${i}: deve ser objeto (não-null, não-array).`,
      };
    }
    const keys = Object.keys(item as Record<string, unknown>);
    if (keys.length !== 1) {
      return {
        ok: false,
        error: `Item ${i}: deve ter exatamente 1 chave (encontradas ${keys.length}).`,
      };
    }
    const k = keys[0];
    const v = (item as Record<string, unknown>)[k];
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return {
        ok: false,
        error: `Item ${i} (chave "${k}"): valor deve ser objeto (não-null, não-array).`,
      };
    }
    const inner = v as Record<string, unknown>;
    const innerKeys = Object.keys(inner);
    if (innerKeys.length > MAX_CAMPOS_POR_GRUPO) {
      return {
        ok: false,
        error: `Limite excedido no grupo "${k}": até ${MAX_CAMPOS_POR_GRUPO} campos por grupo (recebidos ${innerKeys.length}). Sistema precisa ser ajustado pra suportar mais — fale com o time de dev.`,
      };
    }
    for (const fk of innerKeys) {
      const fv = inner[fk];
      if (typeof fv === "string" && fv.length > MAX_STRING_LEN) {
        return {
          ok: false,
          error: `Grupo "${k}", campo "${fk}": string excede ${MAX_STRING_LEN} caracteres (${fv.length}).`,
        };
      }
      if (Array.isArray(fv)) {
        if (fv.length > MAX_ARRAY_LEN) {
          return {
            ok: false,
            error: `Grupo "${k}", campo "${fk}": array excede ${MAX_ARRAY_LEN} elementos (${fv.length}).`,
          };
        }
        for (let j = 0; j < fv.length; j++) {
          const el = fv[j];
          if (typeof el === "string" && el.length > MAX_STRING_LEN) {
            return {
              ok: false,
              error: `Grupo "${k}", campo "${fk}"[${j}]: string excede ${MAX_STRING_LEN} caracteres.`,
            };
          }
        }
      }
    }
    out.push({ [k]: inner });
  }
  return { ok: true, v: out };
}

// --- Template canônico (Bloco G) ---
//
// Casing literal — preservar acentos e maiúsculas (`dados_de_configuração`,
// `Email`) — não normalizar, são consumidos por workflows N8N externos.

export const GROUP_DADOS_CONFIG = "dados_de_configuração";
export const GROUP_COLUNA_INICIAL = "coluna_inicial";
export const GROUP_COLUNA_QUALIFICACAO = "coluna_qualificacao";

export const EXPECTED_GROUPS = [
  GROUP_DADOS_CONFIG,
  GROUP_COLUNA_INICIAL,
  GROUP_COLUNA_QUALIFICACAO,
] as const;

export const DADOS_CONFIG_FIELDS = [
  "loja_id",
  "Email",
  "telefone",
  "loja_crm_id",
] as const;

export const COLUNA_SLOT_FIELDS = ["nome", "id", "slug", "tipo"] as const;

/** Retorna deep-clone do template default. NÃO retorne const compartilhada
 *  pra evitar mutação acidental no client. */
export function getDefaultAutomacaoConfig(): DadosConfigGroup[] {
  return [
    {
      [GROUP_DADOS_CONFIG]: {
        loja_id: "",
        Email: "",
        telefone: "",
        loja_crm_id: "",
      },
    },
    {
      [GROUP_COLUNA_INICIAL]: {
        nome: "",
        id: "",
        slug: "",
        tipo: "inicial",
      },
    },
    {
      [GROUP_COLUNA_QUALIFICACAO]: {
        nome: "",
        id: "",
        slug: "",
        tipo: "qualificacao",
      },
    },
  ];
}

/** Encontra o objeto interno de um grupo pelo nome. */
export function findGroup(
  cfg: unknown,
  name: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(cfg)) return undefined;
  for (const item of cfg) {
    if (
      item &&
      typeof item === "object" &&
      Object.prototype.hasOwnProperty.call(item, name)
    ) {
      const v = (item as Record<string, unknown>)[name];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    }
  }
  return undefined;
}
