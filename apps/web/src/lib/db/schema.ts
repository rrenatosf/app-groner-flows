import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const clientes = pgTable("clientes", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .generatedByDefaultAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  nome: varchar("nome"),
  email: varchar("email"),
  telefone: varchar("telefone"),
  senha: varchar("senha"),
  isActive: boolean("is_active").default(true),
  apiToken: text("api_token"),
  apiInstanciaNome: varchar("api_instancia_nome"),
  apiBaseUrl: varchar("api_base_url"),
  crmTenant: varchar("crm_tenant"),
  crmToken: text("crm_token"),
  crmOrigemId: varchar("crm_origem_id"),
  crmStatusColunas: jsonb("crm_status_colunas").$type<CrmStatusSlot[] | null>(),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  lojas: jsonb("lojas").$type<Loja[]>().notNull().default([]),
  vendedores: jsonb("vendedores").$type<Vendedor[]>().notNull().default([]),
});

export type Loja = {
  /** UUID estável gerado pela aplicação. Identifica a loja unicamente
   *  dentro do sistema, independente de crm_id externo. Preparação pra
   *  futura migração do array jsonb pra tabela própria (esse uuid vira
   *  PK). Sempre presente em lojas criadas pela app; lojas legadas
   *  ganham uuid no backfill. */
  id: string;
  nome: string;
  crm_id: string;
  area_atuacao: number;
  consumo_minimo: number;
  cnpj: string | null;
  telefone: string | null;
  // endereco: string única, legado (CRM antigo concatena tudo num campo só).
  // Mantido pra compat. Para shape canonical novo, use os endereco_* abaixo.
  endereco: string | null;
  // Localização granular (canonical novo). Cidade/estado canonical
  // são apenas `endereco_cidade`/`endereco_estado` — não duplica em
  // `loja_*` (decisão 2026-05-07).
  endereco_cep: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  // Configuração de agenda do tenant (slot/turno/horizonte de marcação)
  agenda_qtd_slotes: string | null;
  agenda_qtd_turnos: string | null;
  agenda_dias_frente: string | null;
  agenda_tempo_slots: string | null;
  agenda_max_dias_fente: string | null;
  agenda_tempo_antecessor: string | null;
  agenda_tempo_antecedencia: string | null;
  [extra: string]: unknown;
};

export const LOJA_CANONICAL_KEYS = [
  "id",
  "nome",
  "crm_id",
  "area_atuacao",
  "consumo_minimo",
  "cnpj",
  "telefone",
  "endereco",
  "endereco_cep",
  "endereco_rua",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
  "endereco_numero",
  "endereco_complemento",
  "agenda_qtd_slotes",
  "agenda_qtd_turnos",
  "agenda_dias_frente",
  "agenda_tempo_slots",
  "agenda_max_dias_fente",
  "agenda_tempo_antecessor",
  "agenda_tempo_antecedencia",
] as const;
export const LOJA_CANONICAL_KEY_SET: ReadonlySet<string> = new Set(
  LOJA_CANONICAL_KEYS,
);

// Defaults de agenda — preenchidos no insert de toda loja nova.
// Mantidos em constantes pra serem reusados na UI (form) e no server.
export const LOJA_AGENDA_DEFAULTS = {
  agenda_qtd_slotes: "2",
  agenda_qtd_turnos: "2",
  agenda_dias_frente: "1",
  agenda_tempo_slots: "60",
  agenda_max_dias_fente: "20160",
  agenda_tempo_antecessor: "120",
  agenda_tempo_antecedencia: "120",
} as const;

export function emptyLoja(): Loja {
  return {
    id: crypto.randomUUID(),
    nome: "",
    crm_id: "",
    area_atuacao: 0,
    consumo_minimo: 0,
    cnpj: null,
    telefone: null,
    endereco: null,
    endereco_cep: null,
    endereco_rua: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_estado: null,
    endereco_numero: null,
    endereco_complemento: null,
    ...LOJA_AGENDA_DEFAULTS,
  };
}

/**
 * Reduz uma loja vinda de qualquer fonte ao shape canonical estrito.
 * Descarta extras (chaves não listadas em LOJA_CANONICAL_KEYS). Usado
 * no save pra "sobrescrever com formatação correta" — campos extras
 * antigos no banco somem.
 */
export function pickCanonicalLoja(
  src: Record<string, unknown>,
): Loja {
  const base = emptyLoja();
  const out: Record<string, unknown> = { ...base };
  for (const k of LOJA_CANONICAL_KEYS) {
    if (k === "id") {
      // Preserva id existente apenas se for string não-vazia. Caso
      // contrário, mantém o uuid fresh gerado por emptyLoja().
      const v = src.id;
      if (typeof v === "string" && v.trim().length > 0) {
        out.id = v;
      }
      continue;
    }
    if (k in src && src[k] !== undefined) {
      out[k] = src[k];
    }
  }
  return out as Loja;
}

// Ordem das chaves padrão do projeto: nome → id → slug → tipo
// (mantida na app; Postgres jsonb não preserva, mas reordenamos ao serializar)
export type CrmStatusTipo = "inicial" | "qualificacao" | "desqualificacao";

export type CrmStatusSlot = {
  nome: string;
  id: string;
  slug: string;
  tipo: CrmStatusTipo;
  /** Marcado como "não utilizado" pelo cliente. Slot preserva no banco
   *  mas deixa de contar como pendente nos contadores de configuração.
   *  Aplicável apenas a slots `desqualificacao` (a UI só expõe lá). */
  notUsed?: boolean;
};

export type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export const DIAS_SEMANA: { key: DiaSemana; label: string }[] = [
  { key: "seg", label: "Segunda" },
  { key: "ter", label: "Terça" },
  { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" },
  { key: "sex", label: "Sexta" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

/** Intervalo de atendimento em formato 24h "HH:MM". `fim` exclusivo. */
export type IntervaloHorario = { inicio: string; fim: string };

export type HorariosVendedor = Partial<Record<DiaSemana, IntervaloHorario[]>>;

export type Vendedor = {
  /** ID legado, sequencial numérico — herdado da tabela `usuarios`
   *  que foi dropada. Mantido pra compat com referências em
   *  agendamentos/leads que ainda usam id numérico. */
  id: number;
  /** UUID estável gerado pela aplicação. Identifica o vendedor
   *  unicamente independente do id numérico legado. Backfill
   *  preenche pra vendedores antigos. Preparação pra futura migração
   *  pra tabela própria. */
  uid: string;
  /** Lista de uuids de lojas (LojaCanonical.id) que esse vendedor
   *  atende. Permite vendedor em múltiplas lojas. Default array vazio. */
  loja_ids: string[];
  nome: string | null;
  email: string | null;
  senha: string | null;
  telefone: string | null;
  role: "owner" | "vendedor";
  is_active: boolean;
  recebe_agendamento: boolean;
  crm_id: string | null;
  ultimo_agendamento: string | null;
  horarios: HorariosVendedor;
  created_at: string;
};

export const VENDEDOR_CANONICAL_KEYS = [
  "id",
  "uid",
  "loja_ids",
  "nome",
  "email",
  "senha",
  "telefone",
  "role",
  "is_active",
  "recebe_agendamento",
  "crm_id",
  "ultimo_agendamento",
  "horarios",
  "created_at",
] as const;
export const VENDEDOR_CANONICAL_KEY_SET: ReadonlySet<string> = new Set(
  VENDEDOR_CANONICAL_KEYS,
);

/**
 * Detecta um vendedor "placeholder" (estrutura canonical com valores
 * vazios) — ancorado no insert de cliente novo. UI deve ignorar esses
 * registros nas listas. Heurística: id <= 0 OU sem email.
 */
export function isPlaceholderVendedor(v: {
  id?: unknown;
  email?: unknown;
}): boolean {
  const id = typeof v.id === "number" ? v.id : Number(v.id ?? 0);
  if (id <= 0) return true;
  const email = typeof v.email === "string" ? v.email.trim() : "";
  return email.length === 0;
}

/**
 * Detecta uma loja "placeholder" (estrutura canonical com valores
 * vazios). Heurística: sem nome.
 */
export function isPlaceholderLoja(l: { nome?: unknown }): boolean {
  const nome = typeof l.nome === "string" ? l.nome.trim() : "";
  return nome.length === 0;
}

/**
 * Vendedor placeholder com shape canonical completo. Todos os campos
 * presentes com valores vazios. Usado no insert de cliente novo pra
 * "ancorar" o schema do jsonb no banco.
 */
export function emptyVendedor(): Vendedor {
  return {
    id: 0,
    uid: crypto.randomUUID(),
    loja_ids: [],
    nome: null,
    email: null,
    senha: null,
    telefone: null,
    role: "vendedor",
    is_active: false,
    recebe_agendamento: false,
    crm_id: null,
    ultimo_agendamento: null,
    horarios: {},
    created_at: new Date().toISOString(),
  };
}

/** Reduz um vendedor vinda de qualquer fonte ao shape canonical estrito.
 *  Preserva uid existente (gera novo só se faltar). Preserva loja_ids
 *  existente (default array vazio). Descarta extras não-canônicos. */
export function pickCanonicalVendedor(
  src: Record<string, unknown>,
): Vendedor {
  const base = emptyVendedor();
  const out: Record<string, unknown> = { ...base };
  for (const k of VENDEDOR_CANONICAL_KEYS) {
    if (k === "uid") {
      const v = src.uid;
      if (typeof v === "string" && v.trim().length > 0) {
        out.uid = v;
      }
      continue;
    }
    if (k === "loja_ids") {
      const v = src.loja_ids;
      if (Array.isArray(v)) {
        out.loja_ids = v.filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        );
      }
      continue;
    }
    if (k in src && src[k] !== undefined) {
      out[k] = src[k];
    }
  }
  return out as Vendedor;
}

// Tabela `usuarios` foi DROPADA em 2026-05-07. Vendedores agora vivem em
// `clientes.vendedores` (jsonb array). Mantido aqui apenas como referência
// histórica — não é mais exportada.

export const agentes = pgTable("agentes", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt"),
  debounceTime: integer("debounce_time").notNull().default(10),
  maxFollowups: integer("max_followups").notNull().default(5),
  humanIntervention: boolean("human_intervention").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  clienteId: bigint("cliente_id", { mode: "number" }).notNull(),
  idN8n: text("id_n8n"),
  voiceGender: text("voice_gender"),
});

export const leads = pgTable("leads", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  nome: text("nome"),
  telefone: text("telefone"),
  leadId: text("lead_id"),
  projetoId: text("projeto_id"),
  statusNome: text("status_nome"),
  statusId: text("status_id"),
  etapaNome: text("etapa_nome"),
  etapaId: text("etapa_id"),
  clienteId: bigint("cliente_id", { mode: "number" }),
  vendedorId: bigint("vendedor_id", { mode: "number" }),
  vendedor: jsonb("vendedor").$type<Vendedor | null>(),
  agendamentoId: bigint("agendamento_id", { mode: "number" }),
  stepFollowup: integer("step_followup"),
  statusFollowup: text("status_followup"),
  proximoFollowup: timestamp("proximo_followup", { withTimezone: true }),
  sessionId: text("session_id"),
});

export const automacoes = pgTable(
  "automacoes",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    baseUrl: text("base_url"),
    n8nWorkflowId: text("n8n_workflow_id"),
    versao: text("versao"),
    isActive: boolean("is_active").notNull().default(true),
    /** Template canônico — copiado pra cliente_automacoes.dados_configuracoes
     *  no momento de criar a instância. Editar aqui não afeta instâncias
     *  existentes. */
    dadosConfiguracoesTemplate: jsonb("dados_configuracoes_template")
      .$type<Array<Record<string, Record<string, unknown>>>>()
      .notNull()
      .default([]),
  },
  (t) => ({
    nomeVersaoUnique: uniqueIndex("automacoes_nome_versao_unique").on(
      t.nome,
      t.versao,
    ),
  }),
);

// Tabela física é `cliente_automacoes` (singular, conforme doc Notion).
// Var TS mantém plural pra alinhar com convenção do codebase.
export const clientesAutomacoes = pgTable(
  "cliente_automacoes",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    automacaoId: bigint("automacao_id", { mode: "number" })
      .notNull()
      .references(() => automacoes.id, { onDelete: "restrict" }),
    clienteId: bigint("cliente_id", { mode: "number" })
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    /** UUID da loja (Loja.id). Soft link — lojas vivem em jsonb. */
    lojaId: text("loja_id").notNull(),
    dadosConfiguracoes: jsonb("dados_configuracoes")
      .$type<Array<Record<string, Record<string, unknown>>>>()
      .notNull()
      .default([]),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => ({
    uniq: uniqueIndex("clientes_automacoes_unique").on(
      t.clienteId,
      t.automacaoId,
      t.lojaId,
    ),
    clienteIdx: index("clientes_automacoes_cliente_idx").on(t.clienteId),
    clienteLojaIdx: index("clientes_automacoes_cliente_loja_idx").on(
      t.clienteId,
      t.lojaId,
    ),
    automacaoIdx: index("clientes_automacoes_automacao_idx").on(t.automacaoId),
  }),
);

export const agendamentos = pgTable("agendamentos", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leadId: bigint("lead_id", { mode: "number" }),
  dataAgendamento: timestamp("data_agendamento", { withTimezone: true }),
  statusAgendamento: text("status_agendamento"),
  observacaoAgendamento: text("observacao_agendamento"),
});

export type Cliente = typeof clientes.$inferSelect;
export type Agente = typeof agentes.$inferSelect;
export type Automacao = typeof automacoes.$inferSelect;
export type ClienteAutomacao = typeof clientesAutomacoes.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Agendamento = typeof agendamentos.$inferSelect;
