import type { HorariosVendedor, IntervaloHorario } from "@/lib/db/schema";

/** Comercial 8–18 (seg–sex). Almoço 12–13. */
export const PRESET_COMERCIAL_8_18: HorariosVendedor = {
  seg: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "18:00" },
  ],
  ter: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "18:00" },
  ],
  qua: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "18:00" },
  ],
  qui: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "18:00" },
  ],
  sex: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "18:00" },
  ],
};

/** Comercial estendido 8–19 (seg–sex) + sábado 8–12. */
export const PRESET_COMERCIAL_8_19_SAB: HorariosVendedor = {
  seg: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ],
  ter: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ],
  qua: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ],
  qui: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ],
  sex: [
    { inicio: "08:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ],
  sab: [{ inicio: "08:00", fim: "12:00" }],
};

export function isHorariosVazio(h: HorariosVendedor | undefined): boolean {
  if (!h) return true;
  for (const arr of Object.values(h)) {
    if (Array.isArray(arr) && arr.length > 0) return false;
  }
  return true;
}

/** Verifica formato HH:MM válido (24h). */
export function isHorarioValido(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Verifica se intervalo é válido: ambos formatos OK e fim > inicio. */
export function isIntervaloValido(i: IntervaloHorario): boolean {
  if (!isHorarioValido(i.inicio) || !isHorarioValido(i.fim)) return false;
  return i.inicio < i.fim;
}

export function camposFaltantesVendedor(v: {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  senha: string | null;
  is_active: boolean;
  recebe_agendamento: boolean;
  horarios?: HorariosVendedor;
}): string[] {
  const faltam: string[] = [];
  if (!v.nome || !v.nome.trim()) faltam.push("nome");
  if (!v.email || !v.email.trim()) faltam.push("e-mail");
  if (!v.telefone || !v.telefone.trim()) faltam.push("telefone");
  if (!v.senha) faltam.push("senha");
  if (!v.is_active) faltam.push("ativo");
  if (!v.recebe_agendamento) faltam.push("recebe agendamento");
  if (isHorariosVazio(v.horarios)) faltam.push("horários");
  return faltam;
}

/** Renderiza a lista de intervalos de um dia em texto humano. */
export function formatHorariosDia(intervalos?: IntervaloHorario[]): string {
  if (!intervalos || intervalos.length === 0) return "—";
  return intervalos.map((i) => `${i.inicio}–${i.fim}`).join(" · ");
}
