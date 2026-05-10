import type { agentes } from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";

export type AgenteRow = typeof agentes.$inferSelect;

export type CriticalAgenteField = {
  key: keyof AgenteRow;
  label: string;
};

export const CRITICAL_AGENTE_FIELDS: CriticalAgenteField[] = [
  { key: "name", label: "Nome" },
  { key: "description", label: "Descrição" },
  { key: "prompt", label: "Prompt" },
  { key: "idN8n", label: "ID n8n (workflow)" },
];

export function pendenciasFor(a: AgenteRow): CriticalAgenteField[] {
  return CRITICAL_AGENTE_FIELDS.filter((f) => {
    const v = a[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}

const AGENTE_LABELS: Record<string, string> = {
  id: "ID",
  name: "Nome",
  description: "Descrição",
  prompt: "Prompt",
  debounceTime: "Tempo de espera (s)",
  maxFollowups: "Máximo de follow-ups",
  humanIntervention: "Intervenção humana",
  isActive: "Ativo",
  clienteId: "Cliente",
  idN8n: "ID n8n",
  voiceGender: "Voz",
};

const AGENTE_EXPECTED: Record<string, string> = {
  id: "número (PK)",
  name: "string não-vazia",
  description: "string ou null",
  prompt: "string ou null",
  debounceTime: "número (default 10s)",
  maxFollowups: "número (default 5)",
  humanIntervention: "boolean",
  isActive: "boolean (default true)",
  clienteId: "FK pra clientes.id",
  idN8n: "id do workflow n8n",
  voiceGender: "voice gender (string ou null)",
};

const ALL_KEYS: (keyof AgenteRow)[] = [
  "id",
  "name",
  "description",
  "prompt",
  "debounceTime",
  "maxFollowups",
  "humanIntervention",
  "isActive",
  "clienteId",
  "idN8n",
  "voiceGender",
];

function fmtActual(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "(ausente)";
  if (typeof v === "string") return v.length === 0 ? '""' : `"${v.length > 60 ? v.slice(0, 60) + "…" : v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v).slice(0, 80);
}

export function buildAgenteValidation(a: AgenteRow): ValidationField[] {
  const out: ValidationField[] = [];
  for (const k of ALL_KEYS) {
    const val = a[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    if (k === "name") {
      if (typeof val !== "string" || val.trim().length === 0) {
        status = "warn";
        detail = "name é obrigatório";
      }
    } else if (k === "prompt") {
      if (val === null || (typeof val === "string" && val.trim() === "")) {
        status = "warn";
        detail = "agente sem prompt — não vai funcionar";
      }
    } else if (k === "idN8n") {
      if (val === null || (typeof val === "string" && val.trim() === "")) {
        status = "warn";
        detail = "workflow n8n não vinculado";
      }
    }
    out.push({
      key: String(k),
      label: AGENTE_LABELS[k] ?? k,
      expected: AGENTE_EXPECTED[k] ?? "—",
      actual: fmtActual(val),
      status,
      detail,
    });
  }
  return out;
}
