import type { ClienteRow } from "./clientes-table";
import type { ValidationField } from "@/components/data-table";

export type CriticalField = {
  key: keyof ClienteRow;
  label: string;
  /** Campo só relevante pro super — pendência ignorada na visão cliente. */
  superOnly?: boolean;
};

/** Campos considerados críticos pra um cadastro "saudável".
 *  Apenas frontend — não persistido. */
export const CRITICAL_FIELDS: CriticalField[] = [
  { key: "nome", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "telefone", label: "Telefone" },
  { key: "senha", label: "Senha", superOnly: true },
  { key: "crmTenant", label: "CRM Tenant" },
  { key: "crmOrigemId", label: "CRM Origem", superOnly: true },
  { key: "apiInstanciaNome", label: "Instância WhatsApp", superOnly: true },
  { key: "apiBaseUrl", label: "API Base URL", superOnly: true },
  { key: "apiToken", label: "API Token", superOnly: true },
  { key: "crmToken", label: "CRM Token", superOnly: true },
];

export function pendenciasFor(
  c: ClienteRow,
  opts?: { isSuper?: boolean },
): CriticalField[] {
  const isSuper = opts?.isSuper ?? true;
  return CRITICAL_FIELDS.filter((f) => {
    if (!isSuper && f.superOnly) return false;
    const v = c[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}

const CLIENTE_FIELD_META: Array<{
  key: keyof ClienteRow;
  label: string;
  expected: string;
  required?: boolean;
}> = [
  { key: "nome", label: "Nome", expected: "string não-vazia", required: true },
  { key: "email", label: "E-mail", expected: "string (formato e-mail)", required: true },
  { key: "telefone", label: "Telefone", expected: "string (E.164 ou bruto)", required: true },
  { key: "senha", label: "Senha", expected: "hash bcrypt ($2a$10$...)", required: true },
  { key: "crmTenant", label: "CRM Tenant", expected: "subdomínio do CRM", required: true },
  { key: "crmOrigemId", label: "CRM Origem", expected: "id numérico string", required: true },
  { key: "apiInstanciaNome", label: "Instância WhatsApp", expected: "tenant--canalNN", required: true },
  { key: "apiBaseUrl", label: "API Base URL", expected: "https://...", required: true },
  { key: "apiToken", label: "API Token", expected: "uuid token Uazapi", required: true },
  { key: "crmToken", label: "CRM Token", expected: "token autenticação CRM", required: true },
  { key: "isActive", label: "Ativo", expected: "boolean (default true)" },
  { key: "isSuperadmin", label: "Superadmin", expected: "boolean (default false)" },
  { key: "createdAt", label: "Criado em", expected: "timestamp" },
];

function fmtClienteActual(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "(ausente)";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return '""';
    if (trimmed.length > 60) return `"${trimmed.slice(0, 60)}…"`;
    return `"${trimmed}"`;
  }
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** Constrói validação canônica vs atual pra um cliente. */
export function buildClienteValidation(
  c: ClienteRow,
  opts?: { isSuper?: boolean },
): ValidationField[] {
  const isSuper = opts?.isSuper ?? true;
  const out: ValidationField[] = [];
  for (const f of CLIENTE_FIELD_META) {
    if (!isSuper && (f.key === "senha" || f.key === "apiToken" || f.key === "crmToken" || f.key === "isSuperadmin")) {
      continue;
    }
    const v = c[f.key];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    if (f.required) {
      if (v === null || v === undefined) {
        status = "warn";
        detail = "campo obrigatório vazio";
      } else if (typeof v === "string" && v.trim() === "") {
        status = "warn";
        detail = "string vazia";
      }
    }
    out.push({
      key: String(f.key),
      label: f.label,
      expected: f.expected,
      actual: fmtClienteActual(v),
      status,
      detail,
    });
  }
  return out;
}
