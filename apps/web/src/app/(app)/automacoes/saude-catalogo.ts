import type { automacoes } from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";
import {
  validateDadosConfiguracoes,
  findGroup,
  GROUP_DADOS_CONFIG,
  GROUP_COLUNA_INICIAL,
  GROUP_COLUNA_QUALIFICACAO,
  DADOS_CONFIG_FIELDS,
} from "./dados-config-shape";

export type CatalogoRow = typeof automacoes.$inferSelect;

export type CriticalCatalogoField = {
  key: keyof CatalogoRow;
  label: string;
};

/** Campos críticos do catálogo. Faltando qualquer um, badge vermelho. */
export const CRITICAL_CATALOGO_FIELDS: CriticalCatalogoField[] = [
  { key: "nome", label: "Nome" },
  { key: "baseUrl", label: "Base URL" },
  { key: "n8nWorkflowId", label: "ID workflow n8n" },
];

const N8N_ID_RE = /^[A-Za-z0-9]{8,}$/;

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function pendenciasCatalogoFor(
  a: CatalogoRow,
): CriticalCatalogoField[] {
  return CRITICAL_CATALOGO_FIELDS.filter((f) => {
    const v = a[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}

const CATALOGO_LABELS: Record<string, string> = {
  id: "ID",
  createdAt: "Criado em",
  nome: "Nome",
  descricao: "Descrição",
  baseUrl: "Base URL",
  n8nWorkflowId: "ID workflow n8n",
  versao: "Versão",
  isActive: "Ativo",
  dadosConfiguracoesTemplate: "Template de configurações (jsonb)",
};

const CATALOGO_EXPECTED: Record<string, string> = {
  id: "número (PK)",
  createdAt: "timestamp",
  nome: "string não-vazia",
  descricao: "string ou null",
  baseUrl: "https://... (URL HTTPS válida)",
  n8nWorkflowId: "[A-Za-z0-9]{8,}",
  versao: "string ou null",
  isActive: "boolean",
  dadosConfiguracoesTemplate:
    "array de objetos com 1 chave string → objeto",
};

const ALL_KEYS: (keyof CatalogoRow)[] = [
  "id",
  "createdAt",
  "nome",
  "descricao",
  "baseUrl",
  "n8nWorkflowId",
  "versao",
  "isActive",
  "dadosConfiguracoesTemplate",
];

function fmtActual(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "(ausente)";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    return v.length === 0
      ? '""'
      : `"${v.length > 60 ? v.slice(0, 60) + "…" : v}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const j = JSON.stringify(v);
    return j.length > 80 ? j.slice(0, 80) + "…" : j;
  } catch {
    return "(non-serializable)";
  }
}

export function buildCatalogoValidation(
  a: CatalogoRow,
): ValidationField[] {
  const out: ValidationField[] = [];
  for (const k of ALL_KEYS) {
    const val = a[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;

    if (k === "nome") {
      if (typeof val !== "string" || val.trim().length === 0) {
        status = "warn";
        detail = "nome é obrigatório";
      }
    } else if (k === "baseUrl") {
      if (val === null || val === undefined) {
        status = "warn";
        detail = "base URL não informada";
      } else if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !isHttpsUrl(val)
      ) {
        status = "warn";
        detail = "base URL deve ser HTTPS válida";
      }
    } else if (k === "n8nWorkflowId") {
      if (val === null || val === undefined) {
        status = "warn";
        detail = "workflow n8n não vinculado";
      } else if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !N8N_ID_RE.test(val.trim())
      ) {
        status = "warn";
        detail = "ID n8n fora do padrão [A-Za-z0-9]{8,}";
      }
    } else if (k === "dadosConfiguracoesTemplate") {
      const v = validateDadosConfiguracoes(val);
      if (!v.ok) {
        status = "warn";
        detail = v.error;
      }
    }

    out.push({
      key: String(k),
      label: CATALOGO_LABELS[k] ?? k,
      expected: CATALOGO_EXPECTED[k] ?? "—",
      actual: fmtActual(val),
      status,
      detail,
    });
  }

  // --- Template canônico (Bloco G): 3 grupos esperados ---
  // Não bloqueia salvar — apenas warns visuais na validação super-only.
  const cfg = a.dadosConfiguracoesTemplate;
  const shapeOk = validateDadosConfiguracoes(cfg).ok;
  if (!shapeOk) return out;

  // Grupo 1: dados_de_configuracao
  {
    const g = findGroup(cfg, GROUP_DADOS_CONFIG);
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    let actual: string;
    if (!g) {
      status = "warn";
      detail = `grupo "${GROUP_DADOS_CONFIG}" ausente`;
      actual = "(ausente)";
    } else {
      const filled: string[] = [];
      const empty: string[] = [];
      for (const f of DADOS_CONFIG_FIELDS) {
        const v = g[f];
        if (typeof v === "string" && v.trim() !== "") {
          filled.push(f);
        } else {
          empty.push(f);
        }
      }
      // No template, esperado: chaves presentes (podem estar vazias —
      // serão preenchidas na instância). Só alertamos se algum campo
      // crítico nem existe no template.
      if (empty.length === DADOS_CONFIG_FIELDS.length) {
        status = "warn";
        detail = "template sem campos preenchidos (placeholder)";
      }
      actual =
        filled.length === 0
          ? "{} (todos vazios)"
          : `preenchidos: ${filled.join(", ")}`;
    }
    out.push({
      key: GROUP_DADOS_CONFIG,
      label: "Grupo: dados_de_configuracao",
      expected: `objeto com ${DADOS_CONFIG_FIELDS.join(", ")}`,
      actual,
      status,
      detail,
    });
  }

  // Grupo 2: coluna_inicial
  {
    const g = findGroup(cfg, GROUP_COLUNA_INICIAL);
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    let actual: string;
    if (!g) {
      status = "warn";
      detail = `grupo "${GROUP_COLUNA_INICIAL}" ausente`;
      actual = "(ausente)";
    } else {
      const tipo = typeof g.tipo === "string" ? g.tipo : "";
      const issues: string[] = [];
      if (tipo !== "inicial") issues.push(`tipo "${tipo}" ≠ "inicial"`);
      if (issues.length > 0) {
        status = "warn";
        detail = issues.join("; ");
      }
      actual = `tipo="${tipo}"`;
    }
    out.push({
      key: GROUP_COLUNA_INICIAL,
      label: "Grupo: coluna_inicial",
      expected: 'tipo="inicial"',
      actual,
      status,
      detail,
    });
  }

  // Grupo 3: coluna_qualificacao
  {
    const g = findGroup(cfg, GROUP_COLUNA_QUALIFICACAO);
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    let actual: string;
    if (!g) {
      status = "warn";
      detail = `grupo "${GROUP_COLUNA_QUALIFICACAO}" ausente`;
      actual = "(ausente)";
    } else {
      const tipo = typeof g.tipo === "string" ? g.tipo : "";
      const issues: string[] = [];
      if (tipo !== "qualificacao")
        issues.push(`tipo "${tipo}" ≠ "qualificacao"`);
      if (issues.length > 0) {
        status = "warn";
        detail = issues.join("; ");
      }
      actual = `tipo="${tipo}"`;
    }
    out.push({
      key: GROUP_COLUNA_QUALIFICACAO,
      label: "Grupo: coluna_qualificacao",
      expected: 'tipo="qualificacao"',
      actual,
      status,
      detail,
    });
  }

  return out;
}
