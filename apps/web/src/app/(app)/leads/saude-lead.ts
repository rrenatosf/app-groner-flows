import {
  VENDEDOR_CANONICAL_KEYS,
  VENDEDOR_CANONICAL_KEY_SET,
  type Lead,
  type Vendedor,
} from "@/lib/db/schema";
import type { ValidationField } from "@/components/data-table";

/** Linha de lead enriquecida com nome do cliente (quando super) e
 *  nome resolvido do vendedor pelo snapshot ou pelo cliente. */
export type LeadRow = Lead & {
  clienteNome: string | null;
  clienteTenant: string | null;
  vendedorNome: string | null;
  /** Nome do catálogo da automação vinculada (cliente_automacoes.id →
   *  automacoes.nome). NULL = lead sem automação. Opcional pra retro-
   *  compat com pages que ainda não populam (cliente drilldown / loja). */
  clienteAutomacaoNome?: string | null;
};

export type CriticalLeadField = {
  key: keyof Lead;
  label: string;
};

/** Critério apertado: só vira pendência se telefone OU etapaNome
 *  estiverem vazios. Lead sem vendedor é normal — IA atende. */
export const CRITICAL_LEAD_FIELDS: CriticalLeadField[] = [
  { key: "telefone", label: "Telefone" },
  { key: "etapaNome", label: "Etapa" },
];

export function pendenciasFor(l: Lead): CriticalLeadField[] {
  return CRITICAL_LEAD_FIELDS.filter((f) => {
    const v = l[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
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
  senha: "hash bcrypt ou null",
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

/** Validação JSON do snapshot `vendedor` (jsonb) do lead. Se o lead
 *  não tem vendedor atribuído, retorna apenas uma linha informativa. */
export function buildLeadValidation(l: Lead): ValidationField[] {
  const vendedor = l.vendedor;
  if (vendedor === null || vendedor === undefined) {
    return [
      {
        key: "vendedor",
        label: "Snapshot vendedor",
        expected: "Vendedor canonical OU null (lead sem vendedor)",
        actual: "null",
        status: "ok",
        detail: "Lead sem vendedor — IA atende.",
      },
    ];
  }
  const raw = vendedor as unknown as Record<string, unknown>;
  const out: ValidationField[] = [];
  for (const k of VENDEDOR_CANONICAL_KEYS) {
    const present = k in raw;
    const val = raw[k];
    let status: "ok" | "warn" = "ok";
    let detail: string | undefined;
    if (k === "uid") {
      if (typeof val !== "string" || val.trim().length === 0) {
        status = "warn";
        detail = "uid ausente — snapshot stale";
      }
    } else if (!present) {
      status = "warn";
      detail = "campo não existe no JSON snapshot";
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

/** Resolve o nome do vendedor pra exibição. Prioriza snapshot.nome
 *  (preserva nome mesmo se vendedor for deletado), cai pra map do
 *  cliente, depois null. */
export function resolveVendedorNome(
  l: Pick<Lead, "vendedorId" | "vendedor">,
  vendedoresMap: Map<number, Vendedor>,
): string | null {
  if (l.vendedor && typeof l.vendedor === "object") {
    const snapNome = (l.vendedor as Vendedor).nome;
    if (typeof snapNome === "string" && snapNome.trim().length > 0) {
      return snapNome;
    }
  }
  if (l.vendedorId !== null && l.vendedorId !== undefined) {
    const v = vendedoresMap.get(l.vendedorId);
    if (v?.nome) return v.nome;
  }
  return null;
}
