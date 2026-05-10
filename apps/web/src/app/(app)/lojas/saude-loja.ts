import { LOJA_CANONICAL_KEYS, LOJA_CANONICAL_KEY_SET, type Loja } from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";

export type CriticalLojaField = {
  key: keyof Loja;
  label: string;
};

/** Campos críticos pra uma loja "saudável" — frontend only, não persistido. */
export const CRITICAL_LOJA_FIELDS: CriticalLojaField[] = [
  { key: "nome", label: "Nome" },
  { key: "crm_id", label: "CRM ID" },
  { key: "telefone", label: "Telefone" },
  { key: "endereco_cidade", label: "Cidade" },
  { key: "endereco_estado", label: "Estado" },
  { key: "area_atuacao", label: "Área de atuação" },
];

export type ShapeIssue =
  | { kind: "missing-field"; key: string; label: string }
  | { kind: "extra-field"; key: string }
  | { kind: "missing-id" };

/** Detecta drift entre o jsonb cru e o shape canônico esperado.
 *  - Campos canônicos faltando.
 *  - Campos extras não-canônicos.
 *  - id ausente ou inválido. */
export function lojaShapeIssues(loja: Record<string, unknown>): ShapeIssue[] {
  const issues: ShapeIssue[] = [];

  const id = loja.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push({ kind: "missing-id" });
  }

  for (const k of LOJA_CANONICAL_KEY_SET) {
    if (!(k in loja)) {
      issues.push({
        kind: "missing-field",
        key: k,
        label: CRITICAL_LOJA_FIELDS.find((f) => f.key === k)?.label ?? k,
      });
    }
  }

  for (const k of Object.keys(loja)) {
    if (k.startsWith("__")) continue; // metadados internos
    if (!LOJA_CANONICAL_KEY_SET.has(k)) {
      issues.push({ kind: "extra-field", key: k });
    }
  }

  return issues;
}

/** Pendências de campos críticos vazios — usado pra coluna Saúde. */
export function pendenciasFor(loja: Loja): CriticalLojaField[] {
  return CRITICAL_LOJA_FIELDS.filter((f) => {
    const v = loja[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (typeof v === "number" && v === 0 && f.key === "area_atuacao")
      return true;
    return false;
  });
}

/** Saúde combinada: pendências + drift de shape. */
export function totalIssues(loja: Loja): {
  pendencias: CriticalLojaField[];
  drift: ShapeIssue[];
  total: number;
} {
  const pendencias = pendenciasFor(loja);
  const drift = lojaShapeIssues(loja as unknown as Record<string, unknown>);
  return { pendencias, drift, total: pendencias.length + drift.length };
}

/** Tipos esperados de cada campo canônico (informativo, mostrado no modal). */
const LOJA_EXPECTED_DESCS: Record<string, string> = {
  id: "uuid (string não-vazia)",
  nome: "string",
  crm_id: "string",
  area_atuacao: "número (km)",
  consumo_minimo: "número",
  cnpj: "string ou null",
  telefone: "string ou null",
  endereco: "string ou null (legado)",
  endereco_cep: "string ou null",
  endereco_rua: "string ou null",
  endereco_bairro: "string ou null",
  endereco_cidade: "string ou null",
  endereco_estado: "string ou null",
  endereco_numero: "string ou null",
  endereco_complemento: "string ou null",
  agenda_qtd_slotes: "string numérica",
  agenda_qtd_turnos: "string numérica",
  agenda_dias_frente: "string numérica",
  agenda_tempo_slots: "string numérica (min)",
  agenda_max_dias_fente: "string numérica",
  agenda_tempo_antecessor: "string numérica (min)",
  agenda_tempo_antecedencia: "string numérica (min)",
};

const LOJA_LABELS: Record<string, string> = {
  id: "ID interno",
  nome: "Nome",
  crm_id: "CRM ID",
  area_atuacao: "Área de atuação",
  consumo_minimo: "Consumo mínimo",
  cnpj: "CNPJ",
  telefone: "Telefone",
  endereco: "Endereço (legado)",
  endereco_cep: "CEP",
  endereco_rua: "Rua",
  endereco_bairro: "Bairro",
  endereco_cidade: "Cidade",
  endereco_estado: "Estado",
  endereco_numero: "Número",
  endereco_complemento: "Complemento",
  agenda_qtd_slotes: "Slots/turno",
  agenda_qtd_turnos: "Turnos/dia",
  agenda_dias_frente: "Dias à frente",
  agenda_tempo_slots: "Tempo do slot",
  agenda_max_dias_fente: "Max dias à frente",
  agenda_tempo_antecessor: "Antecessor",
  agenda_tempo_antecedencia: "Antecedência",
};

function fmtActual(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "(ausente)";
  if (typeof v === "string") return v.length === 0 ? '""' : `"${v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Constrói lista de validação canônica vs atual pra uma loja. */
export function buildLojaValidation(loja: Loja): ValidationField[] {
  const raw = loja as unknown as Record<string, unknown>;
  const out: ValidationField[] = [];

  for (const k of LOJA_CANONICAL_KEYS) {
    const present = k in raw;
    const v = raw[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;

    if (k === "id") {
      if (typeof v !== "string" || v.trim().length === 0) {
        status = "warn";
        detail = "id ausente — backfill necessário";
      }
    } else if (!present) {
      status = "warn";
      detail = "campo não existe no JSON";
    }

    out.push({
      key: k,
      label: LOJA_LABELS[k] ?? k,
      expected: LOJA_EXPECTED_DESCS[k] ?? "—",
      actual: fmtActual(v),
      status,
      detail,
    });
  }

  // Detecta extras (chaves não-canônicas).
  for (const k of Object.keys(raw)) {
    if (k.startsWith("__")) continue;
    if (!LOJA_CANONICAL_KEY_SET.has(k)) {
      out.push({
        key: k,
        label: `(extra) ${k}`,
        expected: "(não esperado)",
        actual: fmtActual(raw[k]),
        status: "warn",
        detail: "campo extra fora do shape canônico",
      });
    }
  }

  return out;
}
