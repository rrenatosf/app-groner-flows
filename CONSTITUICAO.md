# Constituição — Projeto NOVO-SDR

> Documento vivo. Tudo que aprendermos (regras de negócio, decisões, problemas e soluções, padrões, integrações) deve ser registrado aqui. Atualizar sempre que algo novo for definido ou descoberto.

## Fontes da Verdade

1. **Este arquivo** (`CONSTITUICAO.md`) — repositório local, fonte primária técnica.
2. **Notion** — [NOVO-SDR](https://www.notion.so/gf-solucoes/NOVO-SDR-3589084b98ef8051a27dd76b6d13811c?source=copy_link) — progresso, decisões de produto, fixes, armazenamento de informações.
3. **`TECH_STACK.md`** — decisões técnicas no formato `speckit.agent` (escolha + 💡 Motivo + tabela resumo).
4. **`.specify/memory/constitution.md`** — princípios estáveis que governam SpecKit (specs, plans, tasks geradas devem respeitar).

**Regra do tripé (Princípio VII):** toda decisão estrutural ou mudança de schema entra nos 4 lugares acima, sob pena de drift. Quando houver divergência entre fontes, registrar e resolver no PR que originou a mudança.

### Notion — IDs de Referência

- **Página principal NOVO SDR:** `3589084b98ef8051a27dd76b6d13811c`
- **Parent data source `[nexoOS] Projetos (v1.0.3)`:** `collection://dd69084b-98ef-8323-8bf6-07d1a3cba30a`
- **Responsável (user):** `d494f5b0-f914-455f-be93-bdaf0d73cd0d`
- **Etapa atual:** Em progresso · **Planejamento início:** 2026-05-05

**Databases inline da página:**

| Seção | Database ID |
|---|---|
| ✅ Tarefas do Projeto | `78a9084b98ef83f084a201dbd5b7b5e6` |
| 🐞 Fixes do Projeto | `7359084b98ef82d38ac681cdd4ecba0c` |
| 📄 Documentações | `2439084b98ef82bf88d0015da4aae81e` |
| ❇️ Artefatos | `e499084b98ef83928b328180fa804081` |
| ✍🏻 Registros | `d489084b98ef83229bbb8122a43aaef6` |

Regra: docs com propriedade **Tipo = "Fixo"** no DB de Documentações fazem parte da constituição do projeto e devem ser sempre considerados.

---

## Visão Geral do Projeto

- **Nome:** NOVO-SDR
- **Org:** GF Soluções / Groner
- **Objetivo:** _(preencher conforme evoluirmos)_

---

## Stack & Infra

### Supabase (Postgres)

⚠️ Projeto Supabase sem hostname direto. **Conectar exclusivamente via pooler.**

| Campo | Valor |
|---|---|
| Project Ref | `qtzowpbrduzkbyvrzscu` |
| Host | `aws-1-us-east-1.pooler.supabase.com` |
| Port | `5432` (session) ou `6543` (transaction) |
| Database | `postgres` |
| User | `postgres.qtzowpbrduzkbyvrzscu` *(sufixo `.qtzowpbrduzkbyvrzscu` obrigatório — tenant identifier)* |
| Password | `<REDACTED — ver .env.local local; pegar nova em Supabase Dashboard → Settings → Database>` |
| SSL | `require` |

**Conn string (session pooler):**
```
postgresql://postgres.qtzowpbrduzkbyvrzscu:<REDACTED — ver .env.local local; pegar nova em Supabase Dashboard → Settings → Database>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Conn string (transaction pooler):**
```
postgresql://postgres.qtzowpbrduzkbyvrzscu:<REDACTED — ver .env.local local; pegar nova em Supabase Dashboard → Settings → Database>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

**❌ Não usar:**
- Host `db.qtzowpbrduzkbyvrzscu.supabase.co` → DNS NXDOMAIN.
- User `postgres` sem `.qtzowpbrduzkbyvrzscu` → `ENOIDENTIFIER: no tenant identifier provided`.

Validado em 2026-05-05 via psycopg2 (sessão e transaction pooler conectaram com sucesso).

Espelho no Notion: [Credenciais — NOVO SDR](https://www.notion.so/3589084b98ef80c8bdeefa3559d3db63) (Tipo: Fixo)
- **Tabelas atuais (REST schema `public`):**
  - `agendamentos`
  - `agentes`
  - `clientes`
  - `debug_execution`
  - `flows`
  - `leads`
  - `logs`
  - `lojas`
  - `n8n_chat_histories`
  - `usuarios`

### n8n
- **Host:** `https://workflows.gronercrm.com.br`
- **API Base:** `https://workflows.gronercrm.com.br/api/v1`
- **API Key (public-api JWT):** `<REDACTED — ver Notion: Credenciais — NOVO SDR>`
- **Sub (user id n8n):** `474f60ff-43e1-498a-9819-54fb1a4ba287`
- **Audience:** `public-api` · **iat:** 1776127605
- Espelhado em Notion: [Credenciais — NOVO SDR](https://www.notion.so/3589084b98ef80c8bdeefa3559d3db63) (Tipo: Fixo)

#### Credenciais cadastradas no n8n

| Nome | Tipo | ID n8n | Aponta para |
|---|---|---|---|
| `001 - Flows Novo Banco` | `postgres` | `cxbsvQnCAl1UzoVh` | Supabase Postgres `qtzowpbrduzkbyvrzscu` |

---

## Regras de Negócio

_(adicionar conforme forem definidas — ex.: critérios de qualificação de lead, SLA de resposta, fluxo de agendamento, regras de roteamento entre lojas/agentes, etc.)_

---

## Modelagem de Dados

_(documentar schema de cada tabela à medida que formos usando: colunas, tipos, FKs, índices, RLS)_

### `leads`

| Coluna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | NO | identity | PK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `nome` | `text` | YES | — | Nome do lead |
| `telefone` | `text` | YES | — | |
| `lead_id` | `text` | YES | — | ID do lead no CRM externo |
| `projeto_id` | `text` | YES | — | ID do projeto/funil do cliente no CRM |
| `status_nome` | `text` | YES | — | Nome do status atual no CRM |
| `status_id` | `text` | YES | — | ID do status no CRM |
| `etapa_nome` | `text` | YES | — | Nome da etapa atual no CRM |
| `etapa_id` | `text` | YES | — | ID da etapa no CRM |
| `cliente_id` | `bigint` | YES | — | FK → `clientes(id)` ON DELETE CASCADE |
| `vendedor_id` | `bigint` | YES | — | Sem FK. Referencia `id` dentro de `clientes.vendedores` (jsonb). FK antiga removida quando `usuarios` foi DROPADA. |
| `vendedor` | `jsonb` | YES | — | Snapshot denormalizado do `Vendedor` no momento da atribuição (sem campo `senha`). Sincronizado quando o vendedor é editado via `syncLeadsVendedorSnapshot`. |
| `agendamento_id` | `bigint` | YES | — | FK → `agendamentos(id)` ON DELETE SET NULL |
| `step_followup` | `integer` | YES | — | Passo atual no fluxo de follow-up |
| `status_followup` | `text` | YES | — | Status do follow-up |
| `proximo_followup` | `timestamptz` | YES | — | Quando disparar próximo follow-up |
| `session_id` | `text` | YES | — | Identificador da sessão/conversa |

**Índices:** `leads_cliente_id_idx`, `leads_vendedor_id_idx`, `leads_agendamento_id_idx`.

Criada em 2026-05-06.

### `clientes`

| Coluna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | NO | identity | PK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `nome` | `varchar` | YES | — | Nome/razão social |
| `email` | `varchar` | YES | — | Email do owner do tenant (login) |
| `senha` | `varchar` | YES | — | Hash bcrypt (`$2...`); seed pode ter texto puro |
| `telefone` | `varchar` | YES | — | |
| `is_active` | `boolean` | YES | `true` | Se desativado, login bloqueia |
| `api_token` | `text` | YES | — | Token WhatsApp (Z-API/Uazapi/Evolution) |
| `api_instancia_nome` | `varchar` | YES | — | |
| `api_base_url` | `varchar` | YES | — | |
| `crm_tenant` | `varchar` | YES | — | **Subdomínio do tenant** (login). Ex: `looper` → `looper.api.groner.app` |
| `crm_token` | `text` | YES | — | Token do CRM externo |
| `crm_origem_id` | `varchar` | YES | — | ID da origem no CRM |
| `crm_status_colunas` | `jsonb` | YES | — | **Array unificado** `[{nome, id, slug, tipo}, ...]` — substitui `crm_status_incial` + `crm_status_qualificado` + `crm_status_desqualificado` (drop em 2026-05-06). `tipo ∈ {inicial, qualificacao, desqualificacao}`. Slugs estáveis: `inicial`, `qualificado`, `area_atuacao`, `sem_resposta`, `sem_remarketing`, `consumo_insuficiente`, `fechou_c_concorrente`, `desqualificacao_geral`, `desqualificacao_outros` (9 total). Ordem das chaves: nome → id → slug → tipo. |
| `is_superadmin` | `boolean` | NO | `false` | Acesso global a todos os tenants. CHECK constraint só permite `true` para `crm_tenant = 'looper'`. |
| `lojas` | `jsonb` | NO | `'[]'` | Array de unidades físicas do cliente. Schema canonical: `{nome, crm_id, area_atuacao, consumo_minimo, cnpj?, telefone?, endereco?, [extra: unknown]}`. Limites validados: `0 ≤ area_atuacao ≤ 500` km, `0 ≤ consumo_minimo ≤ 100000`. Superadmin pode adicionar `[extra: unknown]`. **Blocklist** rejeita chaves `__proto__`, `prototype`, `constructor`. |
| `vendedores` | `jsonb` | NO | `'[]'` | **Array de vendedores/usuários da loja.** Substitui a tabela `usuarios` (DROPADA 2026-05-07). Schema: `{id, nome, email, senha, telefone, role, is_active, recebe_agendamento, crm_id, ultimo_agendamento, horarios, created_at}`. `horarios: HorariosVendedor` = `Partial<Record<DiaSemana, IntervaloHorario[]>>`. `id` gerado via `Date.now()*1000 + jitter` (anti-colisão concorrente). |

**Renomes 2026-05-06 (feitos pelo usuário fora desta sessão):** `token_api → api_token`, `instancia_nome → api_instancia_nome`, `base_url → api_base_url`, `tenant → crm_tenant`, `token_crm → crm_token`. Adicionadas: `nome, email, senha, is_active, crm_origem_id, crm_status_incial, crm_status_qualificado, crm_status_desqualificado`.

### `agendamentos`

| Coluna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | NO | identity | PK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `lead_id` | `bigint` | YES | — | FK → `leads(id)` ON DELETE CASCADE |
| `data_agendamento` | `timestamptz` | YES | — | Quando o agendamento ocorre |
| `status_agendamento` | `text` | YES | — | |
| `observacao_agendamento` | `text` | YES | — | |

**Índices:** `agendamentos_lead_id_idx`.

**Nota:** FK `agendamentos.lead_id` adicionada via `ALTER TABLE` após criação das duas tabelas, devido a relação circular (`leads.agendamento_id ↔ agendamentos.lead_id`).

Criada em 2026-05-06.

### `agentes`

Agentes do projeto NOVO SDR. Cada agente pertence a um cliente.

| Coluna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | NO | identity | PK |
| `name` | `text` | NO | — | Nome do agente |
| `description` | `text` | YES | — | Descrição |
| `prompt` | `text` | YES | — | Prompt do agente |
| `debounce_time` | `integer` | NO | `10` | Janela de debounce (segundos) |
| `max_followups` | `integer` | NO | `5` | Máximo de follow-ups consecutivos |
| `human_intervention` | `boolean` | NO | `false` | Indica se requer humano |
| `is_active` | `boolean` | NO | `true` | Agente ativo |
| `cliente_id` | `bigint` | NO | — | FK → `clientes(id)` ON DELETE CASCADE |
| `id_n8n` | `text` | YES | NULL | ID do workflow n8n |
| `voice_gender` | `text` | YES | NULL | Gênero da voz |

**Índices:** `agentes_cliente_id_idx` em `cliente_id`.

**Decisões aplicadas (não estavam explícitas no pedido — confirmar se OK):**
- `id`: `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (alinhado com `clientes.id`).
- `name`: `NOT NULL` (assumido por ser identificador; user não especificou).
- `cliente_id`: `NOT NULL` + `ON DELETE CASCADE` (relação obrigatória; agente sem cliente é inválido).
- `id_n8n` e `voice_gender`: tipo `text` nullable (vazio = `NULL`, não string vazia).

Criada em 2026-05-05.

### `lojas`
- _pendente_

### `flows`
- _pendente_

### `usuarios` ❌ DROPPED (2026-05-07)

Tabela removida em definitivo. Vendedores vivem exclusivamente em `clientes.vendedores` (jsonb). Schema histórico mantido abaixo apenas para referência.

### `usuarios` (histórico — DROPPED 2026-05-07)

> **Status:** Tabela mantida temporariamente como fonte legada e backup. **Aplicação não lê nem escreve mais nela.** Vendedores migraram para `clientes.vendedores` (jsonb). Drop da tabela ficou para fase final, conforme combinado.

| Coluna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | NO | identity | PK |
| `created_at` | `timestamptz` | NO | `now()` | |
| `cliente_id` | `bigint` | YES | — | FK → `clientes(id)` ON DELETE CASCADE |
| `nome` | `varchar` | YES | — | |
| `telefone` | `varchar` | YES | — | |
| `email` | `varchar` | YES | — | |
| `senha` | `varchar` | YES | — | Hash bcrypt |
| `is_active` | `boolean` | YES | `true` | |
| `recebe_agendamento` | `boolean` | NO | `true` | |
| `role` | `text` | NO | `'vendedor'` | `'owner'` ou `'vendedor'` |
| `crm_id` | `varchar` | YES | — | |
| `ultimo_agendamento` | `date` | YES | — | |

**Notas de migração 2026-05-06:**
- Backfill: cada `cliente_id` agrupa seus `usuarios` em `clientes.vendedores` (jsonb array preservando `id`).
- FK `leads.vendedor_id → usuarios.id` foi **removida**. Coluna `leads.vendedor_id bigint` mantida sem constraint; corresponde ao `id` dentro do JSON `vendedores`.
- Próximo passo (deferido): `DROP TABLE usuarios` quando tudo validado em produção.

**Removido em 2026-05-06:** `leads_relacionados` (substituído pela FK `leads.vendedor_id → usuarios.id`).

**Índices:** `usuarios_cliente_id_idx`.

### `n8n_chat_histories`
- _pendente_

### `logs` / `debug_execution`
- _pendente_

---

## Fluxos & Workflows (n8n)

| Workflow | ID | Project | Folder | Função |
|---|---|---|---|---|
| _(nome a confirmar)_ | `XIXCPAOdLGHmmjzn` | `0o7uCAqS4yws22Kk` | `1L5uhv6kJB4AZzep` | Recebe e faz tratamento inicial dos dados de loja de **todos os clientes** que entram em contato com o CRM. Porta de entrada do pipeline SDR. Usa credencial `001 - Flows Novo Banco`. |

URL: https://workflows.gronercrm.com.br/workflow/XIXCPAOdLGHmmjzn?projectId=0o7uCAqS4yws22Kk&parentFolderId=1L5uhv6kJB4AZzep

---

## Decisões de Arquitetura (ADRs)

_(formato curto: Data — Decisão — Motivo — Alternativas descartadas)_

---

## Performance — Laudo 2026-05-06

Análise profunda disparada via 2 agentes (analista + supervisor). Estado atual: dev server lento percebido, especialmente no `/dashboard`.

### Medições reais

| Métrica | Valor |
|---|---|
| TTFB `/dashboard` (warmup) | 6.3s (`next.js: 1114ms` + `application-code: 5200ms`) |
| TTFB `/login` (warmup) | 193ms |
| Handshake postgres-js (1ª query do processo) | **1.285–1.447s** |
| RTT por query SELECT no pooler `aws-1-us-east-1` | ~130ms |
| 10 queries sequenciais (warm pool) | 1.359s |
| 10 queries `Promise.all` (warm pool) | **143ms** (speedup 9.5×) |
| 10 queries `Promise.all` (cold pool) | 1.322s (cada conexão abre TLS+auth ~130ms simultaneamente) |
| RSS dev server | ~471–940 MB (cresce com hot reloads) |
| Cache `.next/dev/` | ~267–390 MB |

### Top 3 culpados (ranqueados por ROI)

1. **`getDashboardData` faz 10 queries sequenciais** em `apps/web/src/server/services/dashboard.ts` (linhas 70, 87, 92, 97, 102, 109, 114, 124, 145, 150, 168, 181). Falta `Promise.all`. **Ganho mensurado: ~1.2s por hit do dashboard** (pool quente).
2. **Sem `instrumentation.ts`** — handshake do pool postgres-js paga 1.3s na 1ª request pós-boot. `register()` chamando `await sql\`SELECT 1\`` zera. **Ganho mensurado: ~1.3s na 1ª request por boot.**
3. **`.stagger` com `animation-delay` até 320ms + `opacity:0` inicial** (`apps/web/src/app/globals.css:170-180`). Último KPI atinge visibility em ~740ms após RSC chegar. **Afeta LCP métrica oficial do Chrome**, não só percepção. **Ganho LCP estimado: 500–700ms.**

**Total se aplicar top 3:** dashboard 6.3s → ~1s na pior request; subsequentes <200ms.

### Causas secundárias (não são gargalo)

- CSS `body::after` (SVG `feTurbulence` inline + `mix-blend-mode: overlay`) + `body::before` (radial-gradients) + `backdrop-filter: blur` no topbar/modal/login. **Custam paint/scroll, zero TTFB.** Em M-series ~5ms; em Intel antigo passa de 30ms em scroll.
- `next.config.ts` vazio: sem `serverExternalPackages: ['postgres']` nem `optimizePackageImports: ['lucide-react']`. ~50–200ms compilação Turbopack.
- `readSession` chamado em layout E em page (`(app)/layout.tsx:10` + `dashboard/page.tsx:12`). 3ms total. Resolve com `cache()` do React (3 linhas).
- `db.query.clientes.findFirst` (Drizzle relations API) em hot path — 5–15ms vs `db.select().from().where().limit(1)` explícito.
- Turbopack 1ª compilação por rota nova: ~1.1s. Aceitar como custo de dev.

### Erro encontrado pelo supervisor

Analista marcou o ganho do `Promise.all` como **hipótese** porque mediu 1322ms paralelo no pool **frio**. Supervisor refez no pool **quente**: **143ms**. Razão técnica: pool frio precisa abrir 10 conexões TLS+auth simultaneamente (cada uma ~130ms) → todas pagam handshake. Após warmup, conexões reusadas, paralelismo real funciona. **Lição:** medir performance de DB sempre com pool aquecido (warm-up shot antes do experimento).

### Plano de mitigação (quando autorizado — não aplicado ainda)

Quick wins, ~1h total:
1. `Promise.all` em `getDashboardData` (separar `clientes.findFirst` que serve guard; paralelizar as 10 demais).
2. Criar `apps/web/src/instrumentation.ts` com `register()` que dispara `await db.execute(sql\`SELECT 1\`)`.
3. Reduzir delays de `.stagger` para máximo 120ms total OU remover `opacity:0` inicial e usar só `transform`.
4. Popular `next.config.ts`: `serverExternalPackages: ['postgres']`, `optimizePackageImports: ['lucide-react']`.
5. Wrappear `readSession` com `cache()` do React.

Otimizações de paint (após top 3):
- Tornar `body::after` (noise) opcional via `@media (prefers-reduced-motion: reduce)` ou trocar por PNG cacheado.
- Substituir `backdrop-blur-md` no topbar sticky por `bg-[var(--ink-1)]/95` sólido.
- Manter `body::before` (radial-gradients são baratos).

Fix Notion criado: registrar este laudo + plano (em construção).

## Workflow de Validação (obrigatório em toda alteração)

Princípio adicionado em 2026-05-07 a pedido explícito do dono. Aplica
sempre, sem exceção:

1. **Antes de editar** — listar callsites, tipos compartilhados, fluxos
   paralelos e papéis (superadmin / admin do tenant / vendedor) que
   dependem do que vai mudar. Se o impacto for cross-arquivo, adaptar
   tudo na mesma rodada.
2. **Depois de editar** — `npx tsc --noEmit` no `apps/web` + `grep`
   pelos símbolos alterados pra caçar inconsistência residual.
   Corrigir antes de continuar.
3. **Antes de entregar ao usuário** — testar a feature alterada
   (browser/curl/lint conforme aplicável). Não usar "deve funcionar".
   Confirmar com prova (TS limpo, comando que rodou, screenshot, etc).
4. **Quando esconder/mover UI** — explicitar caminho equivalente
   (atalho, link, rota acessível) pra cada papel afetado. Se fechar
   uma porta, abrir outra.

## Problemas & Soluções

_(formato: Data — Sintoma — Causa raiz — Correção — Prevenção)_

### 2026-05-07 — Separação de domínio superadmin + consolidação de telas

**Login dedicado pra superadmin Groner (`/flows/login`):**
- Nova rota `app/flows/login/page.tsx` (fora do route group `(app)`).
  Aceita só conta com `clientes.is_superadmin = true`. Recusa qualquer
  outra credencial sem criar sessão.
- `/login` (rota do cliente comum) agora **bloqueia superadmin** —
  retorna mensagem pedindo pra entrar via `/flows/login`. Cookie nunca
  é setado pra super nesse fluxo.
- Layout `app/(app)/flows/layout.tsx` redireciona não-autenticado pra
  `/flows/login` (antes ia pra `/login`). Não-super continua indo pra
  `/dashboard`.
- Login do superadmin redireciona pra `/flows`. Login do cliente comum
  continua redirecionando pra `/dashboard`.

**Consolidação de telas pra superadmin:**
- Sidebar do superadmin **esconde** `Lojas`, `Usuários` e `Configurações`
  (item dedicado) — informações já estão dentro do modal de Clientes
  por aba (Identidade · WhatsApp · CRM · Lojas · Usuários).
- Sidebar do superadmin ganha item `Clientes` (link `/perfil/cliente`)
  como hub central de gestão dos tenants.
- Cliente comum continua com sidebar atual (`Lojas`, `Usuários`,
  `Configurações` visíveis pra ele gerenciar o próprio tenant).
- Flag `hideForSuper` adicionada ao tipo `Item` da sidebar pra controlar
  visibilidade.

**Crítico:** mudança de URL afeta links externos / bookmarks. Antes
super entrava em `/login`. Agora `/login` recusa super; super precisa
ir em `/flows/login`. Comunicar ao time Groner antes do deploy.

### 2026-05-07 — Lote de fixes pre-deploy + cadastro completo

Mudanças aplicadas em sequência neste dia (ver commits `7b72d1a..777ced8`):

**Cadastro / Schema:**
- DROP TABLE `usuarios`. Vendedores vivem exclusivamente em `clientes.vendedores`.
- `Vendedor` ganha `horarios: HorariosVendedor` e `created_at` obrigatórios.
- `Loja` ganha `cnpj?`, `telefone?`, `endereco?` como campos nomeados.
- `createCliente` seta `crmStatusColunas: []` na criação (shape canonical desde insert).
- Convenção: toda `createX` em `mutations.ts` lista todas colunas/keys do tipo no insert, mesmo com null/[]/{}/"".
- `importLojasFromCrmAction` faz merge por `crm_id` (não overwrite).
- `importUsuariosFromCrmAction` aceita `horarios` no payload; UI oferece presets `comercial 8-18` / `8-19+sáb` / `sem horário` por linha + apply-all.

**Validação:**
- Limites em loja: `0 ≤ area_atuacao ≤ 500` km, `0 ≤ consumo_minimo ≤ 100000`.
- Blocklist `__proto__`/`prototype`/`constructor` em mutations que mesclam FormData.
- `updateAgendamento` rejeita `Date` inválida (NaN getTime).

**Auth:**
- `isSuperadmin` removido do JWT; lido fresh via `isSuperadminFresh`.
- JWT TTL ajustado: 7 dias (CONSTITUICAO/TECH_STACK ainda diziam 30 — corrigido).
- Senha bcrypt obrigatória — `passwordMatches` rejeita qualquer hash que não comece com `$2*`.
- `nextVendedorId` via `Date.now() * 1000 + jitter` (anti-colisão concorrente em jsonb).

**UI/UX:**
- Menu `Usuários` virou `adminOnly` na sidebar.
- `WhatsappInstanciasButton` extraído pra fora do `ClienteEditModal` (não recriado em cada render).
- Colunas Leads/Em aberto/Finalizados/Agendamentos/Conversão na tabela de Usuários: `text-center → text-right`.
- React 19: `useSyncExternalStore` em `DebugProvider`; derived state em `SearchBox`.

**Dashboard fix:**
- `getDashboardData` retorna `null` quando cliente sumiu; page redireciona pra `/login?reason=cliente-removido` destruindo sessão. Resolve `kind=usuario` quebrando com cookie stale.

**Configuração:**
- `GRONER_INSTANCES_URL` env var (substitui hardcode AWS — fallback inline mantido).
- Removido import `date` não usado em `schema.ts`.

**Notion:** 11/12 fixes pendentes movidos pra `Aguardando`. 12 fixes novos criados pelo pente fino (race conditions em jsonb, `nextClienteId` autoincrement, rate limit no login, decisão Supabase, etc).

### 2026-05-05 — Falha ao criar credencial `supabaseApi` via API pública do n8n
- **Sintoma:** `POST /api/v1/credentials` retornava HTTP 400 com mensagem `request.body.data requires property "allowedDomains"`, mesmo enviando apenas `host` + `serviceRole`.
- **Causa raiz:** o schema do tipo `supabaseApi` (obtido em `/api/v1/credentials/schema/supabaseApi`) usa `allOf` com `if/else` sobre `allowedHttpRequestDomains` (enum `all|domains|none`). Quando o campo é omitido, a validação não cai no ramo `else` corretamente e exige `allowedDomains`. A UI do n8n preenche um default; a API pública não.
- **Correção do payload:** enviar explicitamente `allowedHttpRequestDomains: "all"` no objeto `data` do POST.
- **Prevenção:** sempre que criar credenciais via API n8n, primeiro `GET /api/v1/credentials/schema/<type>` e popular **todos** os campos do schema, incluindo enums com default — não confiar em defaults aplicados pela UI.

> **Nota (2026-05-05 22:20):** A credencial criada nesse experimento (`PwiNhBuQadoghfol`, tipo `supabaseApi`) foi **deletada**. Tinha dois erros: (a) **tipo errado** — a credencial real do projeto é `postgres` (conexão direta via pooler), não `supabaseApi` (REST/PostgREST); (b) **DB errado** — apontava para `obbrcizeeixfgtbryjcz` (project ref de um arquivo local desatualizado em `sdr-groner/Credenciais.md`), enquanto o banco real do NOVO SDR é `qtzowpbrduzkbyvrzscu`. Lição: **fonte da verdade para credenciais deste projeto é a página `Credenciais — NOVO SDR` no Notion (vinculada ao projeto), não arquivos locais legados.**

---

## Padrões de Código & Convenções

_(naming, estrutura de pastas, formatação de prompts SDR, etc.)_

---

## Integrações Externas

_(WhatsApp/Z-API/Evolution, e-mail, calendário, CRM — preencher)_

---

## Autenticação (Web App)

**Fluxo:** subdomínio + email + senha. Subdomínio identifica o cliente (tenant); email + senha autenticam o `cliente` (owner) ou um `usuario` (vendedor) daquele cliente.

1. UI envia `(subdomain, email, password)` para Server Action `loginAction`.
2. Server consulta `clientes` por `lower(crm_tenant) = subdomain`.
   - Se não achar → `TENANT_NOT_FOUND`.
   - Se `is_active = false` → `TENANT_INACTIVE`.
3. Tenta login como **cliente owner**: `clientes.email == email` + bcrypt confere `clientes.senha`.
4. Senão, varre `clientes.vendedores[]` (jsonb) procurando `lower(email) === email` + bcrypt confere `vendedor.senha`.
   - `is_active = false` → `USER_INACTIVE`.
   - Não achou, hash inválido ou senha errada → `INVALID_CREDENTIALS`. **Sem fallback de comparação direta** — desde 2026-05-07 `passwordMatches` exige prefixo `$2*` no hash.
5. Sucesso → JWT HS256 (jose) com `{kind: "cliente"|"usuario", userId, clienteId, tenant, email, name}` em cookie `novosdr_session` httpOnly, SameSite=Lax, Secure em prod, **TTL 7 dias**. **`isSuperadmin` NUNCA é embarcado no JWT** — sempre lido fresh do DB via `isSuperadminFresh(session)`.

**Owners adicionais:** se um item em `clientes.vendedores[]` tem `role='owner'`, o login dele retorna sessão com `kind="cliente"` — recebe permissões equivalentes ao owner principal. Permite que um tenant tenha N owners (ex.: 2 sócios de uma loja).

### Permissões de Mutação

| Recurso | Cliente (owner) | Usuário (vendedor) |
|---|---|---|
| Editar dados do cliente (`/perfil/cliente`) | ✅ | ❌ |
| Resetar senha do cliente | ✅ | ❌ |
| Editar usuário (qualquer) | ✅ | ❌ |
| Resetar senha de usuário | ✅ | ❌ |
| Editar agente (`/automacoes/:id/editar`) | ✅ | ❌ |
| Editar agendamento (`/agendamentos/:id/editar`) | ✅ | ❌ |
| Visualizar dashboards/listas/prompts | ✅ (todo tenant) | ✅ (escopo próprio) |

Implementação: `src/lib/auth/guard.ts` expõe `isOwner(session)` (bool, usado em UI para esconder botões) e `requireOwner(session)` (lança `ForbiddenError`, usado em todas as Server Actions de mutação). UI esconde botões "Editar" para vendedores; Server Actions também rejeitam por defesa em profundidade.

**Hashing:** bcrypt via `bcryptjs`. Hashes começam com `$2`. Durante seed inicial, comparação de texto puro é aceita (substituir por hash assim que houver fluxo de signup/reset).

**Variáveis env necessárias:**

- `DATABASE_URL` (pooler de session, sslmode=require)
- `SESSION_SECRET` (≥32 chars; em prod, 64+ aleatório)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (reservados; ainda não usados pelo fluxo custom)

---

## App Web (`apps/web/`)

Stack instalada e rodando localmente em `http://localhost:3000`:

- **Next.js 16.2.4** (Turbopack) + React 19 + TypeScript estrito
- Tailwind v4 + paleta verde esmeralda (matching Groner Flows)
- Drizzle ORM + `postgres` (postgres-js) + drizzle-kit
- `bcryptjs` + `jose` para auth/sessão
- `server-only` em módulos `db/` e `auth/`

**Estrutura:**

```
apps/web/
  src/
    app/
      layout.tsx
      page.tsx                 # redirect / → /login ou /dashboard
      login/
        page.tsx               # UI Groner Flows (subdomain + email + senha)
        login-form.tsx         # client component (useActionState)
        actions.ts             # server action loginAction
      dashboard/page.tsx       # session-aware (redirect se não logado)
    components/
      header.tsx               # session-aware (mostra tenant + Sair)
      logout-button.tsx
    lib/
      db/
        client.ts              # postgres + drizzle (singleton)
        schema.ts              # clientes, usuarios
      auth/
        session.ts             # createSession/readSession/destroySession (jose)
        login.ts               # loginWithSubdomain
      cn.ts
      supabase/
        client.ts              # reservado para uso futuro
        server.ts
  .env.local                   # contém keys reais (NÃO commitar)
  .env.example                 # template
```

**Rotas:**

- `/` → redirect para `/dashboard` (logado) ou `/login`.
- `/login` → tela "Groner Flows".
- `/dashboard` → preview com saudação, cards e funil placeholder; exige sessão.

**Para subir:** `cd apps/web && npm run dev` (porta 3000).

---

## Padrões de Tabelas Editoriais (2026-05-08)

A partir de 2026-05-08, **toda tabela de listagem de entidade** (Clientes,
Lojas, Usuários e tabelas futuras) segue um padrão unificado para garantir
consistência visual, comportamento previsível e custo baixo de manutenção.

### Comportamento da linha

- **Single-line travado:** CSS global em `.table-editorial td/th` aplica
  `white-space: nowrap; overflow: hidden`. Linhas nunca crescem
  verticalmente. Conteúdo segue regra: ≤ 25 caracteres expande horizontal;
  > 25 caracteres trunca com `…` + `title` no hover mostra completo.
- **Edição inline expansível:** lápis (✎) aparece no hover da célula
  (`opacity-0 group-hover/cell:opacity-100`). Click abre input/textarea
  flutuante que cresce horizontal em `ch` até `max-width: 80ch`; após isso
  textarea wrap automático e altura cresce com `scrollHeight`. `Enter`
  salva, `Shift+Enter` quebra linha (em textarea), `Esc` cancela.
- **Seleção e navegação por teclado** (já existente em `/clientes`):
  arrow keys movem célula selecionada, `Enter` edita, `S` seleciona linha,
  `Esc` limpa.
- **Indicador "ⓘ" amarelo** em células onde o valor é null/vazio e o
  campo é relevante. Cor `rgb(220, 180, 80)`. Ignora colunas virtuais
  (saúde, validação, status WA) e colunas readonly (createdAt, etc).
- **Linhas alternadas + border reforçada:** `td` com border-bottom
  `rgba(70,200,154,0.20)`, stripe leve em `tr:nth-child(even)`,
  hover `rgba(70,200,154,0.07)`. Definido em `globals.css`.

### Toolbar acima da tabela

Fixo na parte superior do `<section>` da tabela:

- **Esquerda:** SearchBox compacto + (super-only) filtro de entidade
  por nome com chip do termo ativo.
- **Direita:** ColumnPicker (mostrar/esconder + reordenar colunas) +
  botão "Ações" (super-only, esconde colunas de botão exceto Saúde) +
  botão "Agrupar" (super-only, agrupa por entidade pai com cabeçalhos
  colapsáveis) + botão "+ Novo X" (admins do tenant).

### ColumnPicker (`@/components/data-table`)

- Genérico via TypeScript (`<K extends string>`).
- Dropdown 280px com input de busca (autofocus), botões "Exibir todas"
  e "Esconder todas", lista alfabética de colunas, checkbox por item.
- Estado persistido em `localStorage` com key `groner.<entidade>.col_hidden_v1`.
- Ordem das colunas também persistida em `groner.<entidade>.col_order_v1`
  (drag/drop nos headers).

### Paginação (`TablePagination`)

- Tamanhos de página: **10 (default)**, 20, 50, 100. Persistido em
  `groner.<entidade>.page_size_v1`.
- Layout: tudo à **esquerda** na sequência `[page size selector]
  [‹‹ ‹ X/Y › ››] [M–N de total]`.
- Reset automático para página 1 quando rows mudam (search/filter/group).
- Navegação por teclado e seleção respeitam apenas a página atual.

### Coluna virtual "Saúde"

- Sempre presente em qualquer entidade com pendências críticas.
- Badge clicável: ✓ verde "completo" se todos os campos críticos
  preenchidos; pill terracota (`rgb(214,110,92)`) com contagem de
  pendentes caso contrário.
- Tooltip lista pendências no hover.
- Click → abre modal de detalhe da entidade.
- Helper `pendenciasFor(entidade)` em `saude.ts`/`saude-loja.ts`/
  `saude-usuario.ts` define `CRITICAL_FIELDS` por entidade.

### Coluna virtual "Validação JSON" (super-only)

- Compara shape canônico esperado pela aplicação com o JSON real
  armazenado.
- Detecta:
  - Campos canônicos faltando (não presentes no JSON).
  - Campos extras (não-canônicos, não esperados).
  - Identificadores ausentes (`id` em loja, `uid` em vendedor).
- Modal `JsonValidationModal` mostra tabela 4 colunas:
  Campo | Esperado pela app | Atual no banco | OK (✓ ou ⚠).
- Botão "Aplicar shape canônico" (super-only) chama
  `applyCanonicalShape(...)` que executa `pickCanonicalLoja`/
  `pickCanonicalVendedor` e salva — preserva valores válidos, gera
  uuid se faltar, descarta extras.

### Switch deslizante (`BooleanToggle`)

- Track 30×16px + thumb 12×12px com transição.
- ON = mint translúcido + thumb claro + glow leve.
- OFF varia: `offIsAlert=true` (ex: `is_active`) → terracota; senão
  cinza neutro.
- Click toggla valor via server action; durante transition fica `pending`.

### Secrets (`SecretActions`/`SecretInput`)

- Tokens (`apiToken`, `crmToken`, `apiBaseUrl`) e senha (hash bcrypt)
  são **mascarados por default** com `••••••••`.
- Botão olho (`◌`/`◉` SVG style Lucide) à esquerda do valor:
  - Per-célula → revela só aquela linha.
  - Per-coluna (no header) → revela todas as linhas da coluna.
- Botão copy (clipboard SVG) → copia valor real mesmo mascarado.
- Após copy: vira ✓ mint por 1.2s, depois volta.
- Reveal **não persiste** entre reloads — sempre oculto na entrada.
- Em formulários (modal de edição), `SecretInput` é input com botões
  embutidos + tipo `password`/`text` toggleável.

### SearchableSelect — padrão para qualquer seleção (2026-05-08)

- **Toda seleção de entidade no sistema usa `SearchableSelect`**
  (cliente, loja, vendedor, agente, funil, etc). Nunca `<select>` nativo.
- Componente genérico em `@/components/data-table/searchable-select.tsx`.
- API: `items`, `value`, `onChange`, `getKey`, `getLabel`, `getSecondary?`,
  `placeholder`, `searchPlaceholder`, `emptyLabel`, `required`, `width`,
  `align`.
- Razão: selects nativos não têm busca e ficam ruins com listas grandes
  (clientes/lojas/vendedores podem chegar em centenas).

### Drag & drop de colunas

- Headers `<th>` são `draggable`. Reorder persiste em
  `groner.<entidade>.col_order_v1`.
- Indicador visual: borda mint na coluna hover durante drag, opacity
  reduzida na coluna sendo arrastada.

### Agrupamento (super-only)

- Botão "Agrupar" no toolbar. Estado interno controla.
- Ao ativar: linhas reorganizadas em grupos com header colapsável.
  **Default: todos os grupos iniciam colapsados** (mostra só headers).
- Click no header expande/colapsa o grupo.
- Quando agrupado, paginação ainda existe mas opera sobre rows
  filtradas globalmente (não sobre grupos).
- Header do grupo mostra: nome da entidade pai + tenant + contagem
  de itens.

### Auto-fetch on mount + erros visíveis

- Status remotos (ex: WhatsApp) são buscados automaticamente ao entrar
  na página (`useEffect` no mount, sequencial pra cada item).
- **Erros nunca são silenciosos.** Banner âmbar visível ou tooltip com
  mensagem detalhada do erro. Botão pra retentar (click no badge).
- Razão: silenciar erro de fetch externo gera bug oculto. Usuário
  precisa saber que API não respondeu.

---

## Componentes Compartilhados — `apps/web/src/components/data-table/`

Pasta criada em **2026-05-08** com componentes reutilizáveis em
qualquer tabela editorial. Exportados via barrel `index.ts`.

| Componente | Função |
|---|---|
| `BooleanToggle` | Switch deslizante on/off com offIsAlert |
| `CopyButton` | Botão copy + feedback ✓ mint por 1.2s |
| `SecretActions` | Combo eye + copy pra valores secretos |
| `SecretInput` | Input password com eye/copy/wrapper colado |
| `ColumnPicker<K>` | Dropdown mostrar/esconder colunas |
| `TablePagination` | Barra paginação 10/20/50/100 |
| `JsonValidationModal` | Modal de comparação shape esperado vs atual |
| `SearchableSelect<T,K>` | Dropdown de seleção genérico com busca |
| `IconEye/IconEyeOff/IconCopy/IconCheck/IconInfo/IconWarn` | Ícones Lucide-style inline SVG |
| `copyToClipboard` (helper) | Copia texto via Clipboard API + fallback |

Helper `PasswordConfirm` em `apps/web/src/components/password-confirm.tsx`
(modal pra gate de privilege escalation).

---

## Hierarquia de Permissões (consolidado 2026-05-08)

3 níveis distintos:

1. **Super Groner** (`clientes.is_superadmin = true`, hoje só Looper).
   Acesso global cross-tenant a Clientes, Lojas, Usuários, Flows,
   Cadastro, Agentes. UI tem tabelas com colunas extras (Tenant,
   Validação JSON, Status WA, etc) e ações de força (drift fix, mover
   loja, etc).

2. **Cliente** (`session.kind === "cliente"`, dono do tenant).
   Acesso ao próprio tenant. Vê e edita próprios dados, lojas,
   vendedores. Não vê colunas super-only (tokens, validação, status WA).

3. **Usuário/Vendedor** (`session.kind === "usuario"`,
   `clientes.vendedores[].role`):
   - **`role: "owner"`** = admin do tenant. Permissão de edição igual ao
     cliente dono (gerencia outros vendedores da mesma loja/tenant).
   - **`role: "vendedor"`** = usuário comum. Read-only nas tabelas;
     edita só a própria linha quando aplicável.

UI exibe `owner`→"Admin", `vendedor`→"Usuário" (DB mantém termos
internos pra compat).

### Privilege escalation password gate

- Qualquer mudança em `clientes.is_superadmin` (ativar **ou** desativar)
  exige senha do super atuante.
- Mesma regra na criação de cliente novo com `is_superadmin: true`.
- Implementação: `verifySuperPasswordAction(password)` (server action
  separada, sem persistir) + `PasswordConfirm` modal no client.
- Fluxo: click no checkbox/toggle → prompt → server compara via
  `bcrypt.compare` → se OK, persiste verifiedSuperPw e flipa state local;
  se falha, mantém prompt aberto com erro.

---

## Schema jsonb shape (sem mexer SQL)

A partir de **2026-05-08**, mudanças de identificação de entidades
nested (lojas, vendedores) seguem este padrão **sem alterar coluna
SQL** — só estrutura interna do jsonb.

### `Loja` em `clientes.lojas`

- Campo novo `id: string` (uuid v4) — identifica unicamente cada loja.
- `LOJA_CANONICAL_KEYS` exporta a lista oficial (com `id` no início).
- `emptyLoja()` gera `id` via `crypto.randomUUID()`.
- `pickCanonicalLoja(src)` preserva `id` se for string não-vazia,
  caso contrário gera novo. Descarta extras não-canônicos.

### `Vendedor` em `clientes.vendedores`

- Campo novo `uid: string` (uuid v4) — id estável independente do
  `id` numérico legado (que era de quando havia tabela `usuarios`).
- Campo novo `loja_ids: string[]` — array de uuids de lojas que esse
  vendedor atende. Permite múltiplas lojas. Mantém `loja_id` legado
  pra compat se aparecer em payloads antigos.
- `VENDEDOR_CANONICAL_KEYS` exporta lista oficial.
- `emptyVendedor()` gera `uid` + `loja_ids: []`.
- `pickCanonicalVendedor(src)` preserva `uid` se válido, copia
  `loja_id` legado pra `loja_ids` se array vazio.

### Backfill workflow (obrigatório pra mudança de shape jsonb)

1. **Schema TS first** — atualiza type + helpers `emptyX`/`pickCanonicalX`.
2. **Script de backfill** em `apps/web/scripts/backfill-X-ids.ts` —
   lê dados existentes, injeta novos campos preservando o que tem,
   idempotente.
3. **Dois modos**: dry-run (default) lista mudanças sem gravar; `--apply`
   grava no banco.
4. **npm scripts**: `backfill:X-ids` (dry) e `backfill:X-ids:apply`.
5. **Verificar idempotência**: rodar dry-run após apply deve mostrar
   "0 sem id".
6. **Autorização explícita do usuário** antes de cada mudança de shape
   jsonb.

### Backfills executados

- **2026-05-08:** lojas — 25 lojas em 18 clientes ganharam `id` uuid.
- **2026-05-08:** vendedores — 57 vendedores em 18 clientes ganharam
  `uid` uuid + `loja_ids: []`.

---

## Hierarquia de tabelas e telas (estado em 2026-05-08)

```
Clientes (tabela SQL)
├── lojas (jsonb array)
│     └── identificadas por { cliente_id, loja.id (uuid) }
└── vendedores (jsonb array)
      └── identificados por { cliente_id, vendedor.uid (uuid) }
      └── vendedor.loja_ids[] aponta pra loja.id (multi)
```

### Telas no padrão editorial unificado

- **`/clientes`** (super + cliente comum):
  - Super vê todos clientes com colunas extras (tokens, senha, status
    WA, validação JSON, isSuperadmin).
  - Cliente comum vê só própria linha com colunas reduzidas (nome,
    email, telefone, tenant, saúde).
  - Modal de edição com fields organizados, picker de cliente
    (super-only), botão buscar instâncias WhatsApp.
  - `+ Novo cliente` (super-only) abre modal dedicado com checkbox
    superadmin (gate por senha).

- **`/lojas`** (super + cliente):
  - Super vê todas as lojas cross-tenant com coluna "Cliente",
    drift detection, botão "Buscar do CRM" e "Buscar usuários".
  - Modal de edição em 3 abas: Informações / Endereço / Configuração
    e agenda.
  - `+ Nova loja` abre modal com SearchableSelect de cliente; ao
    escolher, busca lojas no CRM daquele tenant e oferece importar
    via checkbox.

- **`/usuarios`** (super + cliente + vendedor):
  - Super vê todos vendedores cross-tenant com agrupar por loja,
    coluna validação JSON, mapping CRM → Groner via "Buscar usuários
    da loja" (do `/lojas`).
  - Cliente comum vê vendedores das próprias lojas.
  - Vendedor (kind=usuario) read-only exceto se `role=owner`.
  - Modal de edição em 2 abas: Informações (campos + acesso + lojas
    vinculadas via checkbox) / Horários (grid editável com presets).

### Sidebar

Ordem definida 2026-05-08:

- **Super:** Flows → Clientes → Lojas → Cadastro → Dashboard →
  Automações → Leads → Agendamentos → Prompts.
- **Cliente comum:** Clientes → Lojas → Dashboard → Automações →
  Leads → Usuários → Agendamentos → Prompts → Configurações.
- **Vendedor (kind=usuario):** Lojas → Dashboard → Automações →
  Leads → Agendamentos → Prompts.

---

## Glossário

- **SDR:** Sales Development Representative — agente de pré-vendas.
- **Super / Superadmin:** usuário Groner com `clientes.is_superadmin = true`,
  acesso cross-tenant.
- **Cliente:** entidade na tabela `clientes` SQL — representa um tenant
  (empresa contratante). Também usado pra referenciar usuários logados
  com `kind === "cliente"`.
- **Vendedor / Usuário:** registro em `clientes.vendedores[]` jsonb —
  funcionário de um cliente. UI chama de "Usuário" (com role
  Admin/Usuário); DB chama de "Vendedor" (com role owner/vendedor).
- **Tenant:** subdomínio do CRM Groner (`<tenant>.api.groner.app`),
  armazenado em `clientes.crm_tenant`.
- **Drift de shape:** divergência entre estrutura jsonb canônica
  esperada pela app e estrutura real no banco (campos faltando, extras,
  ids ausentes). Detectado e proposto fix via "Aplicar shape canônico".
- **Backfill:** script idempotente que normaliza shape jsonb pra
  vendedores/lojas existentes sem mexer no SQL schema.
- _(adicionar termos do domínio Groner conforme aparecerem)_

---

## Changelog desta Constituição

- 2026-05-05 — Criação do documento. Acesso ao Supabase confirmado via service role; 10 tabelas mapeadas no schema `public`.
- 2026-05-05 — Acesso Notion via MCP confirmado. IDs da página NOVO SDR e dos 5 databases inline (Tarefas, Fixes, Documentações, Artefatos, Registros) registrados.
- 2026-05-05 — Credencial n8n (API Key public-api JWT) registrada na constituição e replicada no Notion como doc Fixo "Credenciais — NOVO SDR" (`3589084b98ef817ca45ec2064e46b2ce`).
- 2026-05-05 — Host do n8n descoberto: `workflows.gronercrm.com.br`. Credencial Supabase `001 - Flows Novo Banco` (tipo `supabaseApi`, ID `PwiNhBuQadoghfol`) criada via API pública. Workflow de entrada `XIXCPAOdLGHmmjzn` documentado. Problema de criação via API e fix (`allowedHttpRequestDomains` obrigatório) registrados em Problemas & Soluções.
- 2026-05-05 — **Correção:** credencial `PwiNhBuQadoghfol` (tipo `supabaseApi`, DB errado) deletada do n8n. Mantida a credencial original do usuário: `001 - Flows Novo Banco` tipo `postgres` (ID `cxbsvQnCAl1UzoVh`) apontando para `qtzowpbrduzkbyvrzscu`. Project ref do Supabase corrigido em toda a constituição. Página duplicada `Credenciais — NOVO SDR` (criada por mim) deletada no Notion; conteúdo consolidado na página `Credenciais` original (`3589084b98ef80c8bdeefa3559d3db63`), agora marcada como Tipo `Fixo`.
- 2026-05-05 — Regra de escopo registrada: ao buscar contexto do projeto NOVO SDR no Notion, considerar **somente** páginas com relação `Projetos = NOVO SDR`. Ignorar arquivos locais legados (ex.: `sdr-groner/Credenciais.md`) como fonte de credenciais.
- 2026-05-05 — Validada conectividade ao Postgres do Supabase via psycopg2. Hostname direto (`db.qtzowpbrduzkbyvrzscu.supabase.co`) **não existe** (DNS NXDOMAIN); só pooler (`aws-1-us-east-1.pooler.supabase.com`) funciona. User exige sufixo `.qtzowpbrduzkbyvrzscu`. Página Notion + constituição atualizadas com config válida + conn strings (session 5432 e transaction 6543). Adicionada seção "Como preencher na UI do n8n" para o usuário corrigir a credencial manualmente.
- 2026-05-05 — Tabela `public.agentes` criada no Supabase `qtzowpbrduzkbyvrzscu`. 11 colunas, FK `cliente_id → clientes(id)` ON DELETE CASCADE, índice em `cliente_id`. Defaults: `debounce_time=10`, `max_followups=5`, `human_intervention=false`, `is_active=true`. `id_n8n` e `voice_gender` ficam NULL por padrão. Decisões assumidas (sem explícito do usuário): `name NOT NULL`, `id` identity, `cliente_id NOT NULL`. Modelagem documentada na constituição.
- 2026-05-06 — Workflow `Normalização IA` (`XIXCPAOdLGHmmjzn`): node `Cache CRM + NOOP 2` migrado de `mode: manual` (45 assignments) para `mode: raw` com expressão única em `jsonOutput` retornando objeto aninhado `{crm, message, user, agent, inbox_id}`. Referências CRM quebradas (`$json.propertyName.lead_*`) corrigidas para `$('Consulta Groner').item.json.lead_*` (7 campos). Demais refs (`NOOP 2`, `GET Tenant`, `GET Agents`, `Processador | Normalização | Midia`) preservadas. Update via `PUT /api/v1/workflows/:id` — `settings.binaryMode` foi rejeitado pela API mas preservado server-side automaticamente.
- 2026-05-06 — DDL em transação única no Supabase `qtzowpbrduzkbyvrzscu`: (1) `usuarios.loja_id` (varchar) renomeada para `cliente_id` e convertida para `bigint`, com FK `cliente_id → clientes(id)` ON DELETE CASCADE + índice; (2) tabela `agendamentos` criada (id, created_at, lead_id, data_agendamento, status_agendamento, observacao_agendamento); (3) tabela `leads` criada com 17 colunas e FKs `cliente_id → clientes` (CASCADE), `vendedor_id → usuarios` (SET NULL), `agendamento_id → agendamentos` (SET NULL); (4) FK circular `agendamentos.lead_id → leads(id)` adicionada por `ALTER` após criação das duas tabelas. Índices em todas as FKs. Modelagem documentada na constituição.
- 2026-05-06 — `TECH_STACK.md` reescrito em modo `speckit.agent` para o NOVO SDR. 15 seções decididas (Arquitetura, Banco, Performance, Segurança, Front/Back, Erros/Logs, Git/Deploy, Testes, Infra, Realtime/Cron, Métricas, i18n, Comunicação, Pagamentos, IA/LLM). Stack confirmada: Next.js 16 + TS + Supabase (DB) + Drizzle ORM + tRPC + Tailwind + shadcn/ui + Resend + Sentry + PostHog + Vercel. Multi-tenant com RLS. Pagar.me (BR) como gateway. Anthropic Claude (+OpenAI fallback) para IA. Speckit + Notion + CONSTITUICAO como tripé de documentação.
- 2026-05-06 — Schema de `clientes` evoluiu (fora desta sessão): renomes `token_api → api_token`, `instancia_nome → api_instancia_nome`, `base_url → api_base_url`, `tenant → crm_tenant`, `token_crm → crm_token`. Adicionadas: `nome, email, senha, is_active, crm_origem_id, crm_status_incial, crm_status_qualificado, crm_status_desqualificado (jsonb)`. Schema de `usuarios`: adicionadas `senha, is_active`; `ultimo_agendamento` mudou para `date`; `leads_relacionados` removida.
- 2026-05-06 — Decisão de auth alterada: **abandonado Supabase Auth** em favor de **auth custom** (subdomínio = `crm_tenant` + email + senha) com bcrypt + JWT (jose) em cookie httpOnly. TECH_STACK.md atualizado nas seções 1 e 4. Motivo: arquitetura Groner é multi-tenant por subdomínio (`<tenant>.api.groner.app`) — Supabase Auth não cobre esse modelo nativamente.
- 2026-05-06 — Stack frontend scaffolded em `apps/web/` com Next.js 16.2.4 (não 15 como no doc anterior — corrigido). Login UI implementada matching referência Groner Flows (paleta verde esmeralda, campo subdomínio com sufixo `.api.groner.app`). Server Action `loginAction` + sessão JWT funcional. Dev server rodando em `http://localhost:3000`. Credenciais Supabase do projeto `qtzowpbrduzkbyvrzscu` (anon, service_role, sb_publishable, sb_secret) registradas no Notion e em `.env.local`.
- 2026-05-06 — Dashboard ligado ao banco real. Service `getDashboardData(session)` em `apps/web/src/server/services/dashboard.ts` retorna: dados do cliente (looper), totais (leads, agendamentos próximos 7d, agentes ativos, taxa de qualificação 30d), funil por `etapa_nome`, top 5 follow-ups, lista de **vendedores** (cliente vê todos os usuários do tenant; vendedor vê só ele) e lista de **agentes** com debounce/max_followups/human_intervention/voice_gender/id_n8n. Schema Drizzle estendido com `agentes`, `leads`, `agendamentos`. Regras de visibilidade aplicadas: `kind=cliente` vê tudo do tenant; `kind=usuario` filtra por `vendedor_id = userId`.
- 2026-05-06 — Layout principal e 5 telas implementadas com escopo do banco atual (briefing rebuscado deferido para fase 2). Estrutura: route group `app/(app)/` com `layout.tsx` que aplica `AppShell` (Sidebar + topbar + auth guard). Sidebar com Dashboard, Automações, Usuários, Agendamentos, Prompts. **Dashboard:** cards (Automações ativas X/Y, Leads em atendimento separados IA/Humano, Agendamentos 7d, Usuários ativos), funil por etapa, top 5 follow-ups, lista de agentes. **/automacoes:** grid de cards de agentes contratados (sem marketplace). **/usuarios:** tabela com nome/email/telefone/status/leads relacionados/abertos/finalizados/agendamentos/taxa de conversão (sem "último acesso" — não temos coluna). **/agendamentos:** lista filtrável (Próximos / Todos) com lead, vendedor, status, observação (calendário fica para fase 2). **/prompts:** lista de agentes com prompt + página detalhe `/prompts/[id]` read-only (testar prompt + persona + juiz ficam para fase 2). **/perfil:** dump da sessão. Itens explicitamente fora do escopo nesta rodada: créditos, biblioteca/contratação de automações, atividades da IA (sem audit_log), health check de integrações, alertas, multi-loja, admin de loja, último acesso, tempo do lead em atendimento, modal de teste de prompt.
- 2026-05-06 — **Tripé de documentação fechado.** `.specify/memory/constitution.md` populado (era template vazio) com princípios I-VII, Stack Constraints, estrutura do monorepo, convenções, quality gates e out-of-scope. `TECH_STACK.md` atualizado com estrutura real (route group `(app)/`, AppShell, services pattern) + tabela "Implementação atual" mapeando o que está pronto vs. pendente. Princípio VII (atualizar 3 docs simultaneamente) explicitado em todos eles. Notion permanece como 4ª fonte para acompanhamento de produto.
- 2026-05-06 — **Permissões de edição implementadas.** Princípio II (visibilidade hierárquica) reforçado com mutações: apenas `kind=cliente` (owner) edita; `kind=usuario` é read-only. Helpers `isOwner(session)` e `requireOwner(session)` em `src/lib/auth/guard.ts` (lança `ForbiddenError`). Service `src/server/services/mutations.ts` com `updateCliente`, `updateClienteSenha`, `updateUsuario`, `updateUsuarioSenha`, `createUsuario`, `updateAgente`, `updateAgendamento` — todos validam ownership por `cliente_id`. Server Actions: `saveAgenteAction`, `saveUsuarioAction`, `saveClienteAction`, `saveAgendamentoAction` — todas chamam `requireOwner` antes de tocar DB. UI: páginas `/automacoes/[id]/editar`, `/usuarios/[id]/editar`, `/agendamentos/[id]/editar`, `/perfil/cliente`. Botões "Editar" só aparecem para owner. Senhas (cliente + usuário) podem ser resetadas via formulário — gravadas como bcrypt. Componentes reutilizáveis: `Field`, `TextArea`, `Toggle`, `Select`, `SaveButton`.
- 2026-05-06 — **Tema claro como default + dark mode toggle.** Paleta clara inspirada em `looper.groner.app`: canvas `#F4F5F8`, surface `#FFFFFF`, borders `#E5E7EB`, fg `#111827`, muted `#4B5563`, brand emerald (mantida). Dark mode preservado (verde profundo). Tailwind v4 dark variant configurado por classe (`@custom-variant dark (&:where(.dark, .dark *))`). CSS vars em `:root` (claro) + `.dark` (escuro) + utilities `canvas`, `surface`, `surface-2`, `side-bg`, `topbar-bg`, `border-soft`, `border-strong`, `text-fg`, `text-muted`, `text-subtle`, `brand-soft` definidas via `@utility` e injetadas no `@theme`. Componentes refatorados para tokens semânticos (sidebar, app-shell, page-header, search-box, detail-modal, form-field, logout-button, login, todas as 5 telas). `ThemeToggle` (client) escreve `localStorage` + cookie `novosdr_theme`. SSR lê o cookie no `RootLayout` e injeta `class="dark"` no `<html>`. Anti-FOUC via `/public/theme-init.js` carregado com `Script` `beforeInteractive`. Default = claro.
- 2026-05-06 — **Reverte do tema claro + paleta `groner` (teal alinhada à logo).** Decisão de UX revertida: produto volta a ser **dark-only** (claro não ficou bom). `theme-toggle.tsx` e `/public/theme-init.js` deletados; `layout.tsx` voltou a ser server component sem `cookies()`. Tokens semânticos (`canvas`, `surface`, `border-soft`, etc.) substituídos de volta por classes dark hardcoded (`bg-[#06120e]`, `bg-zinc-900/40`, `border-groner-900/30`). **Mantida a aprendizagem de paleta:** todo `emerald-*` virou `groner-*` em `@theme inline` (`apps/web/src/app/globals.css`), com tons inspirados na logo (teal): `groner-400 #46c89a`, `groner-500 #2bb087`, `groner-600 #1f9874`, `groner-900 #0f4538`. Substituição via script Python sobre 22 arquivos (`components/*` + `app/(app)/**` + `app/login/*`). Gradient radial do login passou a usar `rgba(43,176,135,...)` no lugar do emerald. Fix registrado no Notion (`3589084b98ef817fbd25f9ab24aa7d8b`).
- 2026-05-06 — **Reverte do reverte: paleta `groner` teal removida, volta ao `emerald` (verde original).** Render quebrado em algumas telas (sidebar dark + main light gray) durante a tentativa do teal. Causa raiz: combinação de stale Turbopack cache + custom `@theme inline` que registrava palette nova mas Tailwind v4 manteve referências antigas. Correção: (1) `groner-*` → `emerald-*` em todos os 19 arquivos de `components/*` + `app/(app)/**` + `app/login/*` via script Python; (2) `globals.css` enxuto sem `@theme inline` custom (só fontes); usa `emerald` built-in do Tailwind; (3) `rgba(43,176,135,...)` → `rgba(16,185,129,...)` no gradient do login; (4) `.next` cache limpo + dev server reiniciado para forçar rebuild. Resultado: visual idêntico à "primeira versão" (verde emerald original) sem alterações estruturais.
- 2026-05-06 — **Tons de verde elevados (sair do quase-preto sem chegar no verde claro da logo).** Ajustes: superfícies passaram de cinza zinc translúcido para hex verde-escuro fixo. Hierarquia: **body `#091811`** (base) < **sidebar `#0b2519`** (~90% escuro) < **card `#143a2c`** (~80% escuro, visivelmente mais verde, usado em automações, tabelas, modais, formulários) < **hover card `#1b4536`**. Sub-cards / table headers / insets: `#0d2a1f`. Logo Groner (`~#46c89a`) continua sendo o teto que **nenhuma superfície** alcança. Substituição via script Python sobre `components/*` + `app/(app)/**` + `app/login/*` + `layout.tsx`. Acentos textuais e bordas mantêm `emerald-*` Tailwind built-in.
- 2026-05-06 — **Fix Reposicionamento bolinha + Modal loja/tokens + Debug copy** (Notion `3589084b98ef80aaa572e91a8918641e` + `3589084b98ef80bc8c91ff42a3bc9211`).
  - DebugToggle reposicionado de `bottom-1 right-1` → `top-2 right-2` no bloco user da sidebar. Bolinha `size-2.5` (10px), glow mint quando ON.
  - Modal de loja (`LojaModal`) aumentado de 640→860px width.
  - Componente `<PasswordField>` novo em `components/password-field.tsx` — input `type="password"` com botão olho para mostrar. Aplicado em Token CRM e Token API WhatsApp.
  - `page.tsx` de `/perfil/cliente` lê `is_superadmin` fresco do DB (mesmo padrão do app-shell). Resolve bug onde tokens não apareciam para superadmin com JWT stale.
  - Debug panel ganhou botão "copiar tudo" no header (formata cada entry com timestamp ISO + label + url + userAgent + JSON pretty) + botão de cópia por entry (hover). Buffer aumentado de 50→200 entries. `DebugLogEntry` agora carrega `url` e `userAgent` automaticamente. Sempre dump completo via `JSON.stringify(d, null, 2)`.
  - Status fixes → Aguardando.
- 2026-05-06 — **Fix Dados Sensíveis** (Notion `3589084b98ef802c97cbc4efbb58b807`, Nível: Alto). TTL `novosdr_session` 30→7 dias. Headers de segurança em `next.config.ts` (HSTS prod, X-Content-Type-Options, X-Frame-Options:DENY, Referrer-Policy, Permissions-Policy). Helpers Supabase órfãos (`lib/supabase/client.ts`, `lib/supabase/server.ts`) deletados — eram fonte de cookies `sb-*` legacy sem nenhum import ativo. `app-shell.tsx` agora lê `is_superadmin` fresco do DB (não mais do JWT), garantindo que mudanças de permissão não dependam de re-login. Auditoria confirmou que nenhum token sensível (CRM/WhatsApp) é embarcado no JWT — payload minimal `{kind, userId, clienteId, tenant, email, name, isSuperadmin?}`. Status do fix → Aguardando.
- 2026-05-06 — **Debug panel + redirect ajustado + dedup de IDs CRM + status visual** (demanda direta).
  - **Debug panel** — `DebugProvider` em `lib/debug/context.tsx` expõe `useDebug()` com `enabled`, `log(label,data)`, `logs`, `clear`. Disponível só pra `is_superadmin`. Estado em localStorage (`groner_debug_enabled`). Toggle minúsculo (3.5×3.5px) no canto inferior-direito do bloco de user na sidebar (`DebugToggle`). Painel flutuante (`DebugPanel`) bottom-right da page mostra contador, lista cronológica reverse, JSON expandido, limpar, collapse. Wired em `AppShell`. Logs adicionados em `CrmStatusSlots`: `checkConnection.start/result`, `fetchFunis.start/result`, `apply`, `clear`.
  - **Save redirect** — `saveClienteAction` redireciona para `/perfil/cliente` (tabela) ao invés de `/perfil` (página de "sessão atual" que era confusa).
  - **Dedup de IDs CRM** — backend valida em `saveClienteAction`: se 2 colunas têm mesmo `id`, lança erro com nome dos slots. Frontend marca slot duplicado com borda vermelha + warning text. Picker mostra coluna como `já atribuído: <Label>` (vermelho, desabilitado) ou `atual deste slot` (verde) ou etapa (default).
  - **Status visual** — componente `ConfigSummary` no topo: counter `X de 9`, % numérico, barra de progresso (verde se 9/9, amarela caso contrário), lista de pills com slots pendentes. Bolinha por slot: verde glow quando configurado, amarela vazia quando pendente, vermelha quando duplicado.
- 2026-05-06 — **Picker WhatsApp Groner + endurecimento de exposição de tokens** (demanda direta, sem fix Notion).
  - Server Action `fetchWhatsappInstanciasAction` chama `GET https://mm1963n7uj.execute-api.us-east-2.amazonaws.com/api/instances?tenant=<crm_tenant>` com header `x-dev-token: $GRONER_ZAP_DEV_TOKEN` (env var server-only). Retorna `{id, nome, baseUrl, token}` extraído de `instanceId`/`name`/`decryptedToken`/`serverDomain+tenant` do payload Groner. UI: botão "Buscar instâncias" no header da seção "Integração WhatsApp" (apenas superadmin) → modal picker similar ao de funis. Click preenche `apiBaseUrl`, `apiInstanciaNome`, `apiToken`.
  - **Fix de segurança:** `page.tsx` agora condiciona `apiToken` e `crmToken` na prop do `<ClienteEditModal>` por `isSuper ? value : null`. Antes vazavam no payload RSC visível no F12 mesmo quando UI escondia o input.
  - **Bug `orNull` corrigido:** `saveClienteAction` usava `orNull(formData.get(name))` que para field ausente do FormData retornava string vazia → `null` no banco. Tokens (`api_token`, `crm_token`) eram apagados em qualquer save vindo de não-superadmin. Substituído por `keepOrSet(name)`: undefined se ausente, `orNull(value)` se presente. `mutations.updateCliente` agora filtra undefined antes do `set()` (drizzle inclui undefined como NULL caso contrário).
  - **Env var nova:** `GRONER_ZAP_DEV_TOKEN` em `.env.local`. Token nunca enviado ao client. Recomendado rotacionar em produção (atualmente o valor está versionado em curl colado no histórico de conversa).
- 2026-05-06 — **CRM: validação de conexão + picker de colunas + picker de funcionários** (demanda direta, sem fix Notion). 
  - Server Action `validateCrmConnectionAction` chama `GET https://<crm_tenant>.api.groner.app/api/conta/minhaConta` e retorna `{tenant, tenantNome, loja, usuario, email, matchesTenant}`. Badge no topo da seção "Funis e etapas do CRM" mostra estado: idle / ok (verde) / warn (amarelo, tenant não bate) / error (vermelho).
  - `crm-status-slots.tsx` reescrito: cada slot tem botão "Selecionar coluna do CRM" (vazio) ou "Trocar / ✕" (preenchido). Click abre `<PickerModal>` modal centralizado com search bar funcional (filtro client-side em tempo real por nome/id/etapa), atualizar (↻) e ESC. Hidden inputs `id_<slug>` / `nome_<slug>` sincronizados com o form pai. Bug do filtro anterior corrigido (estava dentro de `<details>`, agora é modal próprio).
  - Server Action `fetchCrmUsuariosAction` chama `GET https://<crm_tenant>.api.groner.app/api/usuario?pageNumber=1&pageSize=200&somenteAtivos=true` e retorna `{id, nome, email, celular, ativo}[]`.
  - `/usuarios/novo` (form.tsx) ganhou botão "Buscar do CRM" no topo. Picker modal `<CrmUsuariosPicker>` com search + lista. Click em funcionário preenche Nome, E-mail, Telefone, ID no CRM via `key={"crm-"+id}` no grid (força re-render dos `<Field>` uncontrolled). Senha continua manual.
- 2026-05-06 — **Unificação das 3 colunas CRM em uma só** (Fix Notion `3589084b98ef805ba661dd3dab3f82d4`). `crm_status_incial` + `crm_status_qualificado` + `crm_status_desqualificado` foram **dropadas** e substituídas por `crm_status_colunas` jsonb array. Cada item: `{nome, id, slug, tipo}`. `tipo` classifica como `inicial`, `qualificacao` ou `desqualificacao`. Migração SQL: jsonb_build_array + jsonb_build_object preservou IDs/nomes/slugs do Looper, marcou `tipo` automaticamente. Tipo TS: `CrmStatusTipo = "inicial" | "qualificacao" | "desqualificacao"`. Helpers em `slots.ts`: `findByTipo`, `findBySlug`, `filterDesqualificacao`. Component `CrmStatusSlots` agora recebe `colunas: CrmStatusSlot[] | null` (1 prop). UI agrupada visualmente em 3 seções (Start Inicial / Qualificação / Desqualificação) com label `tipo: <valor>` em cada slot. `crm-funis-fetcher.tsx` (dead code antigo) deletado. Print: `crm-status-colunas-unificado.png`. Status do fix → Aguardando.
- 2026-05-06 — **Padronização da ordem de chaves + desqualificado vira array** (Fix Notion `3589084b98ef801a89e2fa5856dae493`). Ordem canônica das chaves em todos os objetos de coluna do CRM: **`nome` → `id` → `slug`**. Tipo `CrmStatusSlot` redeclarado nessa ordem. `crm_status_desqualificado` migrado de map `{slug: {id, nome}}` para **array** `[{nome, id, slug}, ...]`. Helpers `normalizeSlot` e `normalizeSlotList` em `apps/web/src/lib/crm/slots.ts` reconstroem na ordem ao ler do banco. `mutations.updateCliente` aceita array. `saveClienteAction` monta cada slot como `{nome, id, slug}` literal (ordem de declaração TS preserva ao serializar). Component `CrmStatusSlots` aceita array e localiza slot por slug em `DESQUALIFICADO_SLUGS`. Status do fix → Aguardando.
- 2026-05-06 — **CRM funis: slots fixos com par nome+id+slug.** Schema `clientes.crm_status_incial` e `crm_status_qualificado` migradas de varchar para **jsonb** com formato `{id, nome, slug}`. `crm_status_desqualificado` mantém formato map `{slug: {id, nome}}` (Looper já tinha 6 slugs nomeados; adicionei `desqualificacao_outros` para totalizar 7). Constantes em `apps/web/src/lib/crm/slots.ts`: 1 inicial + 1 qualificado + 7 desqualificações com slugs estáveis (cliente nunca altera o slug). Tipo `CrmStatusSlot = {id, nome, slug}` em `schema.ts`. Componente `CrmStatusSlots` (`crm-status-slots.tsx`) substitui `crm-funis-fetcher.tsx`: renderiza 9 slots fixos com 2 inputs (Nome + ID) e slug read-only. Helper "Buscar do CRM (opcional)" colapsado por padrão — ao expandir, dispara `fetchCrmFunisAction`, mostra top 5 resultados; cada resultado tem dropdown "atribuir a" todos os 9 slots para autopreenchimento. **Parser do CRM corrigido**: shape real do Groner CRM é `{Content: [{etapa: {id, nome}, status: [...]}]}`, não array plano. `saveClienteAction` lê `nome_<slug>` e `id_<slug>` do FormData, monta os 3 jsonb. `mutations.updateCliente` aceita `crmStatusInicial: {id,nome,slug}|null`, `crmStatusQualificado: {id,nome,slug}|null`, `crmStatusDesqualificado: Record<string, {id,nome,slug}>|null`. Botão errado de "Obter funis do CRM" removido do modal de editar loja. Fix Notion `3589084b98ef81518b57c0533c011231` criado como **Pedente** com print referenciável (`/Users/renatosoares/git/groner-projetos/crm-status-slots-zoom.png`).
- 2026-05-06 — **Fetcher de funis/etapas CRM + visibilidade de tokens.** Em `/perfil/cliente` adicionada seção "Funis e etapas do CRM" com botão "Buscar funis e etapas do CRM" que dispara Server Action `fetchCrmFunisAction` em `apps/web/src/app/(app)/perfil/cliente/actions.ts`. Action chama `GET https://<cliente.crm_tenant>.api.groner.app/api/statusProjeto/agrupadoPorEtapa` com `Authorization: Bearer <cliente.crm_token>`, achata resposta para lista plana `{id, nome, etapaId, etapaNome}` (testa chaves alternativas comuns) e devolve ao client. Component `CrmFunisFetcher` (`crm-funis-fetcher.tsx`) renderiza 2 selects (status_inicial, status_qualificado) com optgroup por etapa + checkbox multi para status_desqualificado; valores são sincronizados em hidden inputs do form principal e persistidos via `saveClienteAction` (que agora também salva `crmStatusDesqualificado` jsonb array). Mutations `updateCliente` ganhou parâmetro opcional `crmStatusDesqualificado: unknown[]`. Modal de editar loja em `lojas-section.tsx` ganhou botão "Obter funis do CRM" no header (anchor `/perfil/cliente#crm-funis`) — config é nível de cliente, não loja. **Visibilidade hardcoded:** `api_token` e `crm_token` só aparecem se `cliente.is_superadmin = true` (não-superadmin não vê o input). Configurar via UI a visibilidade por campo é trabalho separado, deferido. Fix Notion `3589084b98ef819f90e6e5dc93496c34` criado como **Pedente** com print anexável (`/Users/renatosoares/git/groner-projetos/perfil-cliente-crm-funis.png`).
- 2026-05-06 — **Reunião Thiago — sobreposição de modelo. Vendedores viram JSON em `clientes`.** Decisões da reunião sobrepõem decisões anteriores. (1) **Banco:** adicionada coluna `clientes.vendedores jsonb NOT NULL DEFAULT '[]'`. Backfill: cada cliente recebeu array com seus usuarios.* anteriores agrupados por `cliente_id`, preservando `id` numérico para compatibilidade com `leads.vendedor_id`. FK `leads_vendedor_id_fkey` removida (coluna mantida sem constraint). Tabela `usuarios` **mantida intocada como legacy/backup** — drop ficou para fase final. (2) **Tipo TS `Vendedor`** exportado em `schema.ts`: `{id, nome, email, senha, telefone, role, is_active, recebe_agendamento, crm_id, ultimo_agendamento, created_at}`. (3) **Login flow** (`src/lib/auth/login.ts`) reescrito: cliente continua via `clientes.email/senha`; vendedor agora é buscado dentro de `clientes.vendedores[]` por email; password match e role escalation idênticos. (4) **Service `usuarios.ts`** (`listUsuariosByCliente`, `findVendedorById`, `loadVendedores`) lê do JSON. Agregações de leads/agendamentos por `vendedor_id` permanecem em SQL — `leads` continua tabela. (5) **Mutations** (`createUsuario`, `updateUsuario`, `updateUsuarioSenha`, `setUsuarioActive`, `setUsuarioRecebeAgendamento`) reescritas como manipulação de array (read → patch → write inteiro). Geração de novo `id` via `max(existentes)+1`. Validação de email único feita em memória. (6) **UI inalterada visualmente:** `/usuarios`, `/usuarios/novo`, `/usuarios/[id]/editar` continuam com mesmo contrato; só a fonte mudou. Switches inline, criação, edição, reset de senha, role admin/usuário — tudo funcional. (7) **Não dropada `usuarios`** — etapa final pós-validação. (8) **Outras decisões da reunião** que dependem de outras etapas: leads sai do normalizador (apenas no n8n, sem impacto na UI), payload do webhook Agrone fornece dados sem busca extra, follow-up step infere contexto. Notion meeting `Alinhamento Thiago` registrada.
- 2026-05-06 — **Cosméticos UI:** (1) Header da tabela `/leads` renomeado: `FU` → `Tentativas Follow`, `Status FU` → `Status Follow`, `Próximo FU` → `Próximo Follow`. Modal de detalhes do lead idem. Schema do banco (`step_followup`, `status_followup`, `proximo_followup`) inalterado — só rótulos visuais. (2) `next.config.ts` `devIndicators: { position: "bottom-right" }` — botão de dev tools do Next.js volta no canto inferior direito (em vez de `false`). Sem impacto em produção. (3) Form de loja: textos de descrição agora usam `<strong>` real (sem markdown literal `**chave**`) e fieldset de campos extras já apresenta 3 pares chave/valor vazios pré-renderizados quando em modo superadmin para reduzir clicks.
- 2026-05-06 — **Lojas viraram tabela editorial + modal ao clicar.** A `LojasSection` agora renderiza uma `.table-editorial` com colunas Nome, CRM ID, Área (km), Consumo mín., Extras (count). Click na linha abre modal próprio (DetailModal local com keyboard escape) mostrando todos os campos da loja em `info-block` + footer com Editar / Remover. Form de adicionar/editar continua inline (renderiza acima da tabela) controlado por state local `mode: list|view|edit|add`. Visual de card foi descontinuado como listagem padrão; agora aparece só dentro do modal. Em modo superadmin, form sempre apresenta no mínimo 3 pares chave/valor pré-renderizados para preencher.
- 2026-05-06 — **Campos extras de Lojas viraram pares chave/valor** (substituiu textarea de JSON cru). Form ganhou fieldset "Campos extras (apenas superadmin)" com lista dinâmica: cada item tem 2 inputs separados (Chave + Valor) + botão remover; botão "+ Adicionar campo" empilha mais. Server Action lê `extra_key[]` e `extra_value[]` do FormData e monta objeto. Heurística: valores `true`/`false` viram boolean, numéricos viram Number, resto fica string. Removida dependência de o usuário saber JSON.
- 2026-05-06 — **Tela dedicada `/lojas` no menu lateral.** A seção `LojasSection` (criada no `/perfil/cliente`) ganhou rota própria `/lojas` listada na sidebar logo abaixo de Dashboard. Component reutilizado: a página `/lojas` carrega `clientes.lojas` do tenant e renderiza o mesmo CRUD inline. Server Actions ganham `revalidatePath("/lojas")` para refletir alterações nas duas rotas. Acesso restrito a `isOwner` (vendedor redirecionado para `/dashboard`).
- 2026-05-06 — **Coluna `clientes.lojas` (jsonb) + UI no `/perfil/cliente`.** (1) Schema: `clientes.lojas jsonb NOT NULL DEFAULT '[]'`. Tipo TS exportado em `schema.ts` como `Loja = {nome, crm_id, area_atuacao (km), consumo_minimo, [extra]: unknown}`. (2) Service `setClienteLojas(clienteId, lojas)` em mutations. Server Actions `addLojaAction` / `updateLojaAction` / `removeLojaAction` em `apps/web/src/app/(app)/perfil/cliente/lojas/actions.ts` — todas guardadas por `requireOwner`. (3) Componente `LojasSection` (client) acoplado ao final de `/perfil/cliente` — mostra lista de cards com nome, CRM ID, área de atuação e consumo mínimo; botões Editar/Remover por loja; botão "+ Adicionar loja" abre form inline. (4) Form com 4 campos default; campo extra (textarea JSON) **só aparece para superadmin** (`clientes.is_superadmin === true`) — permite anexar campos arbitrários ao objeto da loja. JSON inválido é descartado silenciosamente. (5) Listagem de lojas mostra os campos extras como bloco `<pre>` quando presentes. (6) Acesso restrito a `requireOwner` (vendedor não vê nem edita).
- 2026-05-06 — **Nomenclatura UI + `clientes.is_superadmin`.** (1) Rótulos do select de nível e indicadores de sessão padronizados para **Admin / Usuário** (UI-facing). Valores do banco continuam `owner` / `vendedor`. (2) Modelo definitivo: **`clientes`** = dono da loja (1 admin principal por tenant); **`usuarios`** = pode ter `role='owner'` (Administrador) ou `role='vendedor'` (Usuário comum). Login flow escalona: `usuarios.role='owner'` → kind=cliente. (3) Coluna `clientes.is_superadmin` (boolean NOT NULL DEFAULT false) com CHECK constraint `(is_superadmin = false OR lower(crm_tenant) = 'looper')` — só Looper pode ser superadmin. Looper já marcado. (4) `SessionPayload` ganhou `isSuperadmin?: boolean` populado no login do cliente. Implementação do uso (rotas /admin, switch entre tenants) deferida para fase 2.
- 2026-05-06 — **Cadastro de usuários via UI + role `owner`/`vendedor`.** (1) Schema: `usuarios.role` (text NOT NULL DEFAULT 'vendedor', CHECK in ('owner','vendedor')). Drizzle schema atualizado. (2) **Login flow estendido:** se `usuarios.role = 'owner'`, sessão recebe `kind = "cliente"` (mesma permissão que o owner principal do tenant em `clientes.email/senha`). Permite múltiplos owners por tenant. Implementado em `src/lib/auth/login.ts`. (3) Nova tela `/usuarios/novo` (somente owner) com formulário completo: nome, email, senha (≥6 chars, hashada bcrypt), telefone, crmId, **select de nível** (vendedor/owner), toggle `recebeAgendamento`. Server Action `createUsuarioAction` valida unicidade de email no tenant + chama `createUsuario` de mutations. Botão "Novo usuário" no header de `/usuarios` (só owner). (4) Edição de usuário ganhou select de nível. (5) Tabela de usuários ganhou coluna **Nível** (chip "Owner" com destaque mint vs label "Vendedor" textual). Modal de detalhes mostra Nível. (6) Service `listUsuariosByCliente` retorna `role` no row. Tipo `UsuarioRow` atualizado. (7) **Owner principal** ainda é `clientes.email/senha` — não muda. Modelo: cliente row = tenant + 1 owner inicial; owners adicionais = `usuarios` com role=owner. (8) Fluxo de uso: superadmin cria cliente com email+senha mínimos → owner faz login com tenant+email+senha → preenche `/perfil/cliente` com dados completos (nome, telefone, integrações WhatsApp, CRM) → cadastra equipe via `/usuarios/novo`.
- 2026-05-06 — **Tela `/leads` adicionada.** Faltava no app (sidebar tinha apenas Dashboard, Automações, Usuários, Agendamentos, Prompts). Criados: service `apps/web/src/server/services/leads.ts` (`listLeadsByCliente` com search por nome/telefone/lead_id/etapa/status, join com `usuarios` para nome do vendedor, ordenação por `created_at desc`), página `apps/web/src/app/(app)/leads/page.tsx` com tabela editorial (Nome, Telefone, Etapa, Status, Vendedor, FU step, Status FU, Próximo FU, Recebido em), modal de detalhes com 4 seções (Identificação, CRM, Atribuição, Follow-up), `FollowupBadge` colorido (qualificado=mint, desqualificado=red, aguardando=amber, default). Sidebar ganhou item "Leads" entre Automações e Usuários. Visibilidade: cliente vê todos os leads do tenant; vendedor (`kind=usuario`) vê só `vendedor_id = userId`. Vendedor IA (`vendedor_id IS NULL`) renderiza chip "IA" verde.
- 2026-05-06 — **Switches inline + view switcher + nova coluna `recebe_agendamento`.** (1) Schema: `ALTER TABLE usuarios ADD COLUMN recebe_agendamento boolean NOT NULL DEFAULT true`. Drizzle schema atualizado. (2) `/automacoes`: ganhou alternador de visualização Cards/Tabela via `?view=table`. Tabela usa classe `.table-editorial`. Coluna "Ativo" é um Switch clicável (componente `<Switch>` em `apps/web/src/components/switch.tsx`) que dispara Server Action `toggleAgenteActiveAction`. Mesmo Switch também aparece no card. (3) `/usuarios`: coluna "Status" virou Switch ligado a `toggleUsuarioActiveAction`; nova coluna **"Recebe agendamento"** com Switch ligado a `toggleUsuarioRecebeAgendamentoAction`. Ambas Server Actions guardadas por `requireOwner`. Vendedor vê chip read-only. (4) `Switch` é client component com optimistic UI via `useTransition` + rollback em erro. Visual padrão: pill 36×20 com knob 14×14, mint quando ligado, ink quando desligado, glow no estado ativo. (5) Service `usuarios` retorna `recebeAgendamento` e tipo `UsuarioRow` atualizado. (6) Bug do search-box (lupa sobreposta ao placeholder) corrigido — agora `padding-left: 36px` no input + ícone `pointer-events-none` em `left-3`. Modal e CONSTITUICAO atualizadas.
- 2026-05-06 — **Quick wins de performance APLICADOS** (executor + revisor + veredito final). 5 mudanças entregues sem regressão funcional: (1) `getDashboardData` agora usa `Promise.all` com 11 queries paralelas (guard `clientes.findFirst` antes); (2) `apps/web/src/instrumentation.ts` criado com `register()` aquecendo pool postgres-js no boot; (3) `globals.css` keyframe `lift-in` sem `opacity:0` inicial + `.stagger` delays reduzidos para max 140ms (não atrasa LCP oficial); (4) `next.config.ts` populado com `serverExternalPackages: ["postgres"]` + `experimental.optimizePackageImports: ["lucide-react"]`; (5) `readSession` envelopado em `cache()` do React (dedupe layout↔page no mesmo request). Validação: `npx tsc --noEmit` exit 0, `npm run build` exit 0 (14 rotas geradas), smoke tests warm ~20ms, sem TS errors / hydration warnings / failed-to-compile. Ressalvas (não bloqueantes): login real autenticado não exercitado em curl (precisa cookie); LCP no DevTools não medido; visual de `.lift-in` ficou só translate sem fade (autorizado pelo plano). Fix Notion `3589084b98ef8171b23feb384675b303` marcado Concluído.
- 2026-05-06 — **Laudo de performance via 2 agentes (analista + supervisor).** Veredito final ranqueado: (1) `getDashboardData` 10 queries seq sem `Promise.all` = perdendo ~1.2s/hit (medido warm: paralelo 143ms vs seq 1.359s, speedup 9.5×); (2) sem `instrumentation.ts` → handshake pool postgres-js = +1.3s na 1ª request pós-boot; (3) `.stagger animation-delay` até 320ms + `opacity:0` inicial atrasam LCP métrica oficial em 500–700ms. Total potencial: dashboard 6.3s → ~1s. CSS pesado (SVG noise + mix-blend-mode + backdrop-blur) é problema de paint, **não TTFB**. Erro do analista: mediu paralelização em pool frio (1322ms) e marcou ganho como hipótese; supervisor refez em pool quente e provou ganho real. Detalhes completos em seção `Performance — Laudo 2026-05-06`. **Nenhum código alterado** — usuário pediu apenas análise + documentação.
- 2026-05-06 — **Refino visual "Editorial Trading Terminal" (frontend-design skill).** Direção estética: Stripe Dashboard + Bloomberg Terminal + Linear. Mudanças estruturais aplicadas: (1) **Token system completo em CSS vars** em `globals.css`: ramp `--ink-{0..5}` (HSL ~157°, S 30%, L escalonada 8/11/15/19/25%), paleta `--mint-{50..900}` alinhada à logo, texto `--fg`/`--fg-muted`/`--fg-subtle`/`--fg-disabled`, bordas translúcidas em mint `--b-{soft,base,strong,bright}`, anel `--ring`, shadows `--glow-{sm,md,lg}`. Registrados em `@theme inline` para uso como classes (`bg-[color:var(--ink-3)]`, etc.). (2) **Tipografia editorial:** adicionado **Instrument Serif** (Google Fonts) via `next/font` em `layout.tsx` com `--font-instrument-serif`; classe utilitária `.serif` aplica em headings (h1 do PageHeader, modal titles, "Flows" italic na sidebar/login, valores grandes nas KPIs). Mantido Geist Sans para body, Geist Mono para numerics (classe `.numerics` com `font-variant-numeric: tabular-nums`). (3) **Atmosfera:** body com `::before` radial-gradient duplo (mint glow top-left + bottom-right) + `::after` SVG noise overlay 4% para textura. (4) **Microinterações:** keyframes `lift-in`, `fade-in`, `scale-in` + classe `.stagger` que aplica delay 40ms incremental nos filhos diretos. Modais usam `scale-in`, KPIs entram com stagger, page header com `fade-in`. (5) **Componentes utilitários novos:** `.btn-primary` (gradiente mint 400→500 + inner shadow + glow), `.btn-ghost`, `.input`/`.textarea`/`.select` (focus com mint border + ring), `.chip`/`.chip-mint`/`.chip-amber`/`.chip-red`, `.kpi-card` (top-1px gradient border via mask), `.surface`/`.surface-flat`/`.surface-raised`, `.label-eyebrow` (12px tracked uppercase), `.table-editorial`. (6) **Sidebar redesenhada:** dot indicator no início de cada item, accent line verde 2px com glow no item ativo, mark+wordmark com "Flows" italic em serif, user card no rodapé com avatar gradient mint-700→mint-900 e iniciais. (7) **Dashboard reescrito:** PageHeader com eyebrow + greeting em serif 40px, 4 KPIs com top gradient border, funil com numeração `01..04` e setas conectoras, agentes em grid 2 colunas com mini-stats. (8) **Login:** logo + "Groner Flows" italic, card com glow shadow, footer com domain em uppercase tracked. (9) Restart limpo do Turbopack (`.next` deletado) para garantir CSS fresh. Substituição em massa via script Python (12 arquivos) trocando hex hardcoded e `emerald-*` por `var(--ink-*)`/`var(--mint-*)`/`var(--fg-*)`/`var(--b-*)`.
- 2026-05-06 — **Logo da Groner + Fix do rodapé da sidebar.** Fix do Notion `Nome no canto inferior esquerdo` (`3589084b98ef80919879d79b73984087`) marcado como Concluído: rodapé da sidebar agora mostra avatar de iniciais + nome do usuário + linha "Dono · tenant" ou "Vendedor · tenant" (link pra `/perfil`). `Sidebar` virou client component que recebe `user` via props (`AppShell` server component lê `readSession()` e injeta — respeita Princípio VI). Logo da Groner adicionado em `apps/web/public/assets/brand/groner-logo.png` (copiado de `images.png` da raiz) e referenciado via `next/image` na Sidebar (32×32) e no Login (56×56). Convenção de organização de assets formalizada no Notion como doc Fixo `Organização de assets/mídia (Groner Flows)` (`3589084b98ef8111b390e32259c26f4d`). Criado também doc Fixo `Prompt do agente Notion para gerar Fixes (Groner Flows)` (`3589084b98ef8198898ad827546f2743`) — system prompt para Notion AI gerar Fixes consistentes com formato padrão. Novo Fix criado e já resolvido `Logo da Groner deve aparecer no canto superior esquerdo` (`3589084b98ef81519f04e08d04523ef1`).
- 2026-05-06 — **Modais e busca/filtros aplicados** seguindo briefing. Componente `DetailModal` (`src/components/detail-modal.tsx`) — overlay 80% da tela, fecha com Esc/click no backdrop, controlado por query param `?detail=<id>` (URL compartilhável). Componente `SearchBox` (`src/components/search-box.tsx`) — input debounced 200ms que atualiza `?q=` via `router.replace` + `useTransition`. Telas com busca + modal: **/automacoes** (busca por nome/descrição/prompt; modal mostra status/debounce/follow-ups/voz/n8n + prompt completo + botão "Editar automação" se owner), **/usuarios** (busca por nome/email/telefone; modal com seções Dados + Métricas + botão "Editar usuário" se owner), **/agendamentos** (busca + filtro de data `from`/`to` + tabs Próximos/Todos; modal com lead/vendedor/status/observação + botão "Editar agendamento" se owner), **/prompts** (busca por nome/descrição/prompt; modal com prompt completo). Services aceitam parâmetro `q` e aplicam `ILIKE` em colunas relevantes; `listAgendamentos` aceita `from`/`to` para filtro de data. Princípio do briefing respeitado: modal é centralizado, footer com ação destacada, edição via modal só para owner.
- 2026-05-08 — **Padrão de tabelas editoriais unificado** aplicado em `/clientes`, `/lojas`, `/usuarios`. Componentes shared criados em `apps/web/src/components/data-table/`: `BooleanToggle`, `CopyButton`, `SecretActions`, `SecretInput`, `ColumnPicker<K>`, `TablePagination` (10/20/50/100), `JsonValidationModal`, `SearchableSelect<T,K>`, ícones SVG inline (Eye/EyeOff/Copy/Check/Info/Warn). `PasswordConfirm` em `components/password-confirm.tsx` para gates de privilege escalation. Linhas single-line travadas via CSS global em `.table-editorial td/th` (`white-space:nowrap; overflow:hidden`); ellipsis em 25ch; lápis no hover; edit inline expansível (textarea cresce até 80ch horizontal, depois vertical). Drag/drop reorder de colunas + persistência em localStorage. Coluna virtual `Saúde` em todas as entidades (pendências críticas) e `Validação JSON` super-only (drift detection + "Aplicar shape canônico"). Indicador `ⓘ` amarelo em células vazias relevantes.
- 2026-05-08 — **Mudança de shape jsonb (sem mexer SQL)** autorizada pelo usuário. `Loja.id: string` (uuid) adicionado pra preparar migração futura pra tabela própria. `Vendedor.uid: string` (uuid) + `Vendedor.loja_ids: string[]` (multi-loja) adicionados. `LOJA_CANONICAL_KEYS` e `VENDEDOR_CANONICAL_KEYS` exportados. `pickCanonicalLoja`/`pickCanonicalVendedor` preservam ids existentes e descartam extras. Backfill scripts em `apps/web/scripts/backfill-{loja,vendedor}-ids.ts` (dry-run + apply, idempotentes) executados: 25 lojas em 18 clientes ganharam `id`; 57 vendedores em 18 clientes ganharam `uid` + `loja_ids`. npm scripts: `backfill:loja-ids[:apply]`, `backfill:vendedor-ids[:apply]`.
- 2026-05-08 — **Tabela `/clientes` recriada no padrão editorial** com edição inline célula a célula, secrets com mask/eye/copy, BooleanToggle pra `is_active` e `is_superadmin`, coluna virtual Saúde + Validação JSON, indicador ⓘ amarelo, ColumnPicker, paginação. Modal de criação `+ Novo cliente` com SearchableSelect + busca de instâncias WhatsApp. Modal de edição com tab Pendências/Dados, picker de cliente embutido, busca instâncias WhatsApp e Aplicar aos campos. Coluna virtual `Status WA` (super-only) com auto-fetch on mount + erro detalhado em tooltip + click pra revalidar (não silencioso). Privilege escalation gate em `is_superadmin` (toggle e checkbox no modal) via `verifySuperPasswordAction` + `PasswordConfirm`.
- 2026-05-08 — **Tabela `/lojas` recriada no padrão editorial.** Coluna "Cliente" (renomeada de "Tenant", super-only). Drift detection via `lojaShapeIssues` + Validação JSON com "Aplicar shape canônico". Botão "Buscar do CRM" por linha (super-only) abre modal com mapping campo-a-campo CRM × atual; aplica só campos vazios sem sobrescrever. Botão "Buscar usuários da loja" (super-only) abre modal listando vendedores do CRM com checkbox por usuário e mapping CRM → Groner; cada importado vira vendedor em `clientes.vendedores[]` com `loja_ids: [loja.id]`. Modal `+ Nova loja` com SearchableSelect de cliente; ao escolher, auto-busca lojas do CRM daquele tenant e oferece importar. Modal de edição em 3 abas: Informações / Endereço / Configuração e agenda. Botão "Esconder ações" (super-only) esconde colunas de botão exceto Saúde, com switch deslizante interno. Filtro super-only por nome de loja com chip ativo. Agrupamento por cliente colapsável (super-only, default colapsado).
- 2026-05-08 — **Tabela `/usuarios` recriada no padrão editorial.** Permissões: super tudo, cliente kind=cliente todos os vendedores próprios, vendedor com `role=owner` mesma permissão (admin do tenant), vendedor comum read-only. Coluna "Função" (UI: Admin/Usuário; DB: owner/vendedor). Coluna "Lojas" mostra nomes derivados de `loja_ids`. BooleanToggle pra `is_active` e `recebe_agendamento`. Modal de detalhe em 2 abas: Informações (campos + acesso integrado: senha, função, ativo, recebe_agendamento, lojas vinculadas via checkbox) / Horários (`UsuarioHorariosGrid` controlled, com presets comerciais). `createVendedorTyped` server action gera `uid` automaticamente; `updateVendedorFields` aceita `loja_ids` e `horarios`. Agrupar por loja super-only (header = nome loja + tenant; default colapsado).
- 2026-05-08 — **SearchableSelect formalizado como padrão**. Memória `feedback_searchable_select_padrao.md` criada — toda seleção de entidade futura usa o componente, nunca `<select>` nativo. Aplicado em modal de nova loja (cliente picker) e modal de novo usuário (cliente picker).
- 2026-05-08 — **Reordenação da sidebar.** Super: Flows → Clientes → Lojas → Cadastro → Dashboard → Automações → Leads → Agendamentos → Prompts. Cliente: Clientes → Lojas → Dashboard → Automações → Leads → Usuários → Agendamentos → Prompts → Configurações. `/clientes` mudou de `superOnly` pra `adminOnly` (cliente comum também vê).
- 2026-05-08 — **Tarefa Notion criada** no projeto NOVO SDR (database `[GESTAO] - Tarefas`): "Reset de senha de usuário → enviar via WhatsApp" (P3, Backlog). Quando implementada, importação de usuários do CRM passará a gerar senha aleatória por usuário e enviá-la via WhatsApp em vez de senha padrão única.
- 2026-05-08 — **UI de horários migrada** do legacy `/usuarios/[id]/editar` pro modal novo. Componente `UsuarioHorariosGrid` (controlled, em `apps/web/src/app/(app)/usuarios/usuario-horarios-grid.tsx`) substituiu placeholder JSON cru. Suporta presets `PRESET_COMERCIAL_8_18` e `PRESET_COMERCIAL_8_19_SAB`. Grade por dia da semana com múltiplos intervalos por dia, edição/remoção/limpar.
