import type { ClienteAutomacao } from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";
import {
  validateDadosConfiguracoes,
  findGroup,
  GROUP_DADOS_CONFIG,
  GROUP_COLUNA_INICIAL,
  GROUP_COLUNA_QUALIFICACAO,
  DADOS_CONFIG_FIELDS,
  type DadosConfigGroup,
} from "./dados-config-shape";

/** Linha de instância "rica" — joinada com colunas do catálogo pra
 *  validar baseUrl / workflow / versão herdados. Catálogo é a fonte
 *  de verdade pra esses campos; instância valida só lojaId/isActive
 *  + shape de dados_configuracoes. */
export type InstanciaRowFull = ClienteAutomacao & {
  catalogoNome: string | null;
  catalogoBaseUrl: string | null;
  catalogoWorkflowId: string | null;
  catalogoVersao: string | null;
  /** Template do catálogo no momento do load — usado pelo edit modal pra
   *  "restaurar template". Pode estar desatualizado se super editou
   *  template após instância criada (decisão consciente: instância
   *  não auto-sincroniza). */
  catalogoTemplate: DadosConfigGroup[];
  catalogoComentarios: Record<string, string>;
};

export type CriticalInstanciaField = {
  key: keyof InstanciaRowFull;
  label: string;
};

/** Campos críticos da instância. */
export const CRITICAL_INSTANCIA_FIELDS: CriticalInstanciaField[] = [
  { key: "lojaId", label: "Loja" },
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

export function pendenciasInstanciaFor(
  r: InstanciaRowFull,
): CriticalInstanciaField[] {
  return CRITICAL_INSTANCIA_FIELDS.filter((f) => {
    const v = r[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}

const INSTANCIA_LABELS: Record<string, string> = {
  id: "ID",
  createdAt: "Criado em",
  automacaoId: "Catálogo (FK)",
  clienteId: "Cliente (FK)",
  lojaId: "Loja",
  isActive: "Ativo",
  dadosConfiguracoes: "Configurações (jsonb)",
  catalogoNome: "Nome (catálogo)",
  catalogoBaseUrl: "Base URL (catálogo)",
  catalogoWorkflowId: "ID workflow n8n (catálogo)",
  catalogoVersao: "Versão (catálogo)",
};

const INSTANCIA_EXPECTED: Record<string, string> = {
  id: "número (PK)",
  createdAt: "timestamp",
  automacaoId: "FK pra automacoes.id",
  clienteId: "FK pra clientes.id",
  lojaId: "uuid de Loja (não-vazio)",
  isActive: "boolean",
  dadosConfiguracoes:
    "array de objetos com 1 chave string → objeto",
  catalogoNome: "herdado do catálogo (informativo)",
  catalogoBaseUrl: "https://... (URL HTTPS válida) — herdado do catálogo",
  catalogoWorkflowId: "[A-Za-z0-9]{8,} — herdado do catálogo",
  catalogoVersao: "string ou null — herdado do catálogo",
};

const ALL_KEYS: (keyof InstanciaRowFull)[] = [
  "id",
  "createdAt",
  "automacaoId",
  "clienteId",
  "lojaId",
  "isActive",
  "catalogoNome",
  "catalogoBaseUrl",
  "catalogoWorkflowId",
  "catalogoVersao",
  "dadosConfiguracoes",
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

export function buildInstanciaValidation(
  r: InstanciaRowFull,
): ValidationField[] {
  const out: ValidationField[] = [];
  for (const k of ALL_KEYS) {
    const val = r[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;

    if (k === "lojaId") {
      if (typeof val !== "string" || val.trim().length === 0) {
        status = "warn";
        detail = "lojaId é obrigatório";
      }
    } else if (k === "catalogoBaseUrl") {
      if (val === null || val === undefined) {
        status = "warn";
        detail = "base URL não informada no catálogo";
      } else if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !isHttpsUrl(val)
      ) {
        status = "warn";
        detail = "base URL do catálogo deve ser HTTPS válida";
      }
    } else if (k === "catalogoWorkflowId") {
      if (val === null || val === undefined) {
        status = "warn";
        detail = "workflow n8n não vinculado no catálogo";
      } else if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !N8N_ID_RE.test(val.trim())
      ) {
        status = "warn";
        detail = "ID n8n do catálogo fora do padrão [A-Za-z0-9]{8,}";
      }
    } else if (k === "dadosConfiguracoes") {
      const v = validateDadosConfiguracoes(val);
      if (!v.ok) {
        status = "warn";
        detail = v.error;
      }
    }

    out.push({
      key: String(k),
      label: INSTANCIA_LABELS[k] ?? String(k),
      expected: INSTANCIA_EXPECTED[k] ?? "—",
      actual: fmtActual(val),
      status,
      detail,
    });
  }

  // --- Template canônico (Bloco G): 3 grupos esperados em dados_configuracoes ---
  const cfg = r.dadosConfiguracoes;
  const shapeOk = validateDadosConfiguracoes(cfg).ok;
  if (!shapeOk) return out;

  // Grupo 1: dados_de_configuracao (4 campos string não-vazios)
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
      if (empty.length > 0) {
        status = "warn";
        detail = `campos vazios: ${empty.join(", ")}`;
      }
      actual =
        filled.length === 0
          ? "{} (todos vazios)"
          : `preenchidos: ${filled.join(", ")}`;
    }
    out.push({
      key: GROUP_DADOS_CONFIG,
      label: "Grupo: dados_de_configuracao",
      expected: `objeto com ${DADOS_CONFIG_FIELDS.join(", ")} string não-vazios`,
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
      const nome = typeof g.nome === "string" ? g.nome.trim() : "";
      const id = typeof g.id === "string" ? g.id.trim() : "";
      const tipo = typeof g.tipo === "string" ? g.tipo : "";
      const issues: string[] = [];
      if (nome === "") issues.push("nome vazio");
      if (id === "") issues.push("id vazio");
      if (tipo !== "inicial") issues.push(`tipo "${tipo}" ≠ "inicial"`);
      if (issues.length > 0) {
        status = "warn";
        detail = issues.join("; ");
      }
      actual = `nome="${nome}", id="${id}", tipo="${tipo}"`;
    }
    out.push({
      key: GROUP_COLUNA_INICIAL,
      label: "Grupo: coluna_inicial",
      expected: 'nome+id não-vazios, tipo="inicial"',
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
      const nome = typeof g.nome === "string" ? g.nome.trim() : "";
      const id = typeof g.id === "string" ? g.id.trim() : "";
      const tipo = typeof g.tipo === "string" ? g.tipo : "";
      const issues: string[] = [];
      if (nome === "") issues.push("nome vazio");
      if (id === "") issues.push("id vazio");
      if (tipo !== "qualificacao")
        issues.push(`tipo "${tipo}" ≠ "qualificacao"`);
      if (issues.length > 0) {
        status = "warn";
        detail = issues.join("; ");
      }
      actual = `nome="${nome}", id="${id}", tipo="${tipo}"`;
    }
    out.push({
      key: GROUP_COLUNA_QUALIFICACAO,
      label: "Grupo: coluna_qualificacao",
      expected: 'nome+id não-vazios, tipo="qualificacao"',
      actual,
      status,
      detail,
    });
  }

  return out;
}
