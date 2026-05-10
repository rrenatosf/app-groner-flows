import type { Agendamento } from "@/lib/db/schema";

/** Linha de agendamento enriquecida com nome/telefone do lead e
 *  nome resolvido do vendedor (via snapshot ou map do tenant). */
export type AgendamentoRow = Agendamento & {
  /** Cliente (tenant) — usado pra render super-only e agrupamento. */
  clienteId: number | null;
  clienteNome: string | null;
  clienteTenant: string | null;
  /** Lead joined fields. */
  leadNome: string | null;
  leadTelefone: string | null;
  /** Vendedor responsável (vem do lead). */
  vendedorId: number | null;
  vendedorNome: string | null;
};

export type CriticalAgendamentoField = {
  key: "dataAgendamento" | "statusAgendamento";
  label: string;
};

/** Critério apertado: pendência só conta se o agendamento em si
 *  estiver incompleto. Lead sem nome/telefone NÃO conta — esse
 *  problema é do lead, não do agendamento. */
export const CRITICAL_AGENDAMENTO_FIELDS: CriticalAgendamentoField[] = [
  { key: "dataAgendamento", label: "Data" },
  { key: "statusAgendamento", label: "Status" },
];

export function pendenciasFor(a: AgendamentoRow): CriticalAgendamentoField[] {
  return CRITICAL_AGENDAMENTO_FIELDS.filter((f) => {
    const v = a[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}
