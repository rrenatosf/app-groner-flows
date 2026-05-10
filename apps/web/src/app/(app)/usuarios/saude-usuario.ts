import {
  VENDEDOR_CANONICAL_KEYS,
  VENDEDOR_CANONICAL_KEY_SET,
  type Vendedor,
} from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";

export type CriticalVendedorField = {
  key: keyof Vendedor;
  label: string;
};

export const CRITICAL_VENDEDOR_FIELDS: CriticalVendedorField[] = [
  { key: "nome", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "telefone", label: "Telefone" },
  { key: "senha", label: "Senha" },
  { key: "loja_ids", label: "Lojas vinculadas" },
];

export function pendenciasFor(v: Vendedor): CriticalVendedorField[] {
  return CRITICAL_VENDEDOR_FIELDS.filter((f) => {
    const val = v[f.key];
    if (val === null || val === undefined) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
  });
}

export type ShapeIssue =
  | { kind: "missing-field"; key: string; label: string }
  | { kind: "extra-field"; key: string }
  | { kind: "missing-uid" };

export function vendedorShapeIssues(
  v: Record<string, unknown>,
): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  const uid = v.uid;
  if (typeof uid !== "string" || uid.trim().length === 0) {
    issues.push({ kind: "missing-uid" });
  }
  for (const k of VENDEDOR_CANONICAL_KEY_SET) {
    if (!(k in v)) {
      issues.push({ kind: "missing-field", key: k, label: k });
    }
  }
  for (const k of Object.keys(v)) {
    if (k.startsWith("__")) continue;
    if (!VENDEDOR_CANONICAL_KEY_SET.has(k)) {
      issues.push({ kind: "extra-field", key: k });
    }
  }
  return issues;
}

export function totalIssues(v: Vendedor): {
  pendencias: CriticalVendedorField[];
  drift: ShapeIssue[];
  total: number;
} {
  const pendencias = pendenciasFor(v);
  const drift = vendedorShapeIssues(v as unknown as Record<string, unknown>);
  return { pendencias, drift, total: pendencias.length + drift.length };
}

const VENDEDOR_LABELS: Record<string, string> = {
  id: "ID legado",
  uid: "UID interno",
  loja_ids: "Lojas",
  nome: "Nome",
  email: "E-mail",
  senha: "Senha (hash)",
  telefone: "Telefone",
  role: "Função",
  is_active: "Ativo",
  recebe_agendamento: "Recebe agendamento",
  crm_id: "CRM ID",
  ultimo_agendamento: "Último agendamento",
  horarios: "Horários",
  created_at: "Criado em",
};

const VENDEDOR_EXPECTED: Record<string, string> = {
  id: "número legado",
  uid: "uuid não-vazio",
  loja_ids: "array de uuids de lojas",
  nome: "string",
  email: "string (e-mail)",
  senha: "hash bcrypt",
  telefone: "string ou null",
  role: '"owner" ou "vendedor"',
  is_active: "boolean",
  recebe_agendamento: "boolean",
  crm_id: "string ou null",
  ultimo_agendamento: "ISO timestamp ou null",
  horarios: "objeto HorariosVendedor",
  created_at: "ISO timestamp",
};

function fmtActual(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "(ausente)";
  if (Array.isArray(v)) return `[${v.length} item(s)]`;
  if (typeof v === "string") return v.length === 0 ? '""' : `"${v}"`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v);
}

export function buildVendedorValidation(v: Vendedor): ValidationField[] {
  const raw = v as unknown as Record<string, unknown>;
  const out: ValidationField[] = [];
  for (const k of VENDEDOR_CANONICAL_KEYS) {
    const present = k in raw;
    const val = raw[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    if (k === "uid") {
      if (typeof val !== "string" || val.trim().length === 0) {
        status = "warn";
        detail = "uid ausente — backfill necessário";
      }
    } else if (!present) {
      status = "warn";
      detail = "campo não existe no JSON";
    }
    out.push({
      key: k,
      label: VENDEDOR_LABELS[k] ?? k,
      expected: VENDEDOR_EXPECTED[k] ?? "—",
      actual: fmtActual(val),
      status,
      detail,
    });
  }
  for (const k of Object.keys(raw)) {
    if (k.startsWith("__")) continue;
    if (!VENDEDOR_CANONICAL_KEY_SET.has(k)) {
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
