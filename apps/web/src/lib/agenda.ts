/** Estado da conexão com a agenda (existe refresh token no CRM?) */
export type StatusConexao =
  | "ok"
  | "nao_conectada"
  | "sem_email"
  | "erro";

/** Estado da permissão (Google aceita usar o token pro calendar?) */
export type StatusPermissao =
  | "ok"
  | "negada"
  | "nao_aplica" // Quando conexão falhou, permissão nem é avaliada
  | "erro";

export type ResultadoAgenda = {
  id: number;
  email: string | null;
  conexao: StatusConexao;
  permissao: StatusPermissao;
  detail?: string;
};

export const CONEXAO_LABELS: Record<StatusConexao, string> = {
  ok: "Conectada",
  nao_conectada: "Não conectada",
  sem_email: "Sem e-mail",
  erro: "Erro CRM",
};

export const CONEXAO_DESCRICOES: Record<StatusConexao, string> = {
  ok: "CRM tem o refresh token Google deste vendedor.",
  nao_conectada:
    "Vendedor não conectou a agenda Google no CRM. Pedir para acessar o CRM, ir em conta e autorizar Google.",
  sem_email: "Vendedor sem e-mail cadastrado. Não dá pra consultar.",
  erro: "Falha inesperada consultando o CRM.",
};

export const PERMISSAO_LABELS: Record<StatusPermissao, string> = {
  ok: "Permissão",
  negada: "Sem permissão",
  nao_aplica: "—",
  erro: "Erro calendário",
};

export const PERMISSAO_DESCRICOES: Record<StatusPermissao, string> = {
  ok: "Google aceitou o token e devolveu eventos do calendar.",
  negada:
    "Vendedor conectou mas NÃO marcou a caixinha de permissão de calendário. Precisa refazer a conexão e marcar a opção de Google Calendar.",
  nao_aplica:
    "Avaliação de permissão pulada porque a conexão ainda não foi estabelecida.",
  erro: "Falha inesperada consultando o servidor de calendário Groner.",
};

type Cores = { bg: string; fg: string; border: string; glyph: string };

export function corConexao(s: StatusConexao): Cores {
  switch (s) {
    case "ok":
      return {
        bg: "var(--ink-3)",
        fg: "var(--mint-300)",
        border: "var(--b-base)",
        glyph: "✓",
      };
    case "nao_conectada":
      return {
        bg: "var(--amber-bg)",
        fg: "var(--amber-300)",
        border: "var(--amber-border)",
        glyph: "○",
      };
    case "sem_email":
      return {
        bg: "rgba(148,163,184,0.10)",
        fg: "var(--fg-subtle)",
        border: "var(--b-soft)",
        glyph: "?",
      };
    case "erro":
      return {
        bg: "var(--rose-bg)",
        fg: "var(--rose-300)",
        border: "var(--rose-border)",
        glyph: "✕",
      };
  }
}

export function corPermissao(s: StatusPermissao): Cores {
  switch (s) {
    case "ok":
      return {
        bg: "var(--ink-3)",
        fg: "var(--mint-300)",
        border: "var(--b-base)",
        glyph: "✓",
      };
    case "negada":
      return {
        bg: "var(--amber-bg)",
        fg: "var(--amber-300)",
        border: "var(--amber-border)",
        glyph: "!",
      };
    case "nao_aplica":
      return {
        bg: "var(--ink-3)",
        fg: "var(--fg-disabled)",
        border: "var(--b-soft)",
        glyph: "—",
      };
    case "erro":
      return {
        bg: "var(--rose-bg)",
        fg: "var(--rose-300)",
        border: "var(--rose-border)",
        glyph: "✕",
      };
  }
}
