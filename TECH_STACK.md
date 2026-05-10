# 🏄‍♂️ SpecKit Vibe Coder: Constituição Técnica do Projeto NOVO SDR

> Decisões aplicadas em **2026-05-06** via modo `speckit.agent` para o projeto NOVO SDR. Última revisão **2026-05-07**.
> Para cada pergunta, mantida apenas a opção escolhida + `💡 Motivo`.
> Fontes da verdade do projeto: este arquivo, [`CONSTITUICAO.md`](./CONSTITUICAO.md), e a página Notion [NOVO SDR](https://www.notion.so/3589084b98ef8051a27dd76b6d13811c).

## Contexto do produto

- **Tipo:** SaaS multi-tenant da Groner.
- **Atores:** `clientes` (tenants/empresas que contratam a Groner) e **vendedores** armazenados em `clientes.vendedores` (jsonb). A tabela `usuarios` foi DROPADA em **2026-05-07**.
- **Regra de visibilidade:** cada vendedor só vê os próprios dados (leads, agendamentos atribuídos a ele); o cliente (admin do tenant) vê todos os dados dos vendedores agregados.
- **Backbone confirmado:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions + RLS).
- **Idioma da interface:** PT-BR.
- **Brasil-first:** fuso `America/Sao_Paulo`, CNPJ/CPF, integrações WhatsApp.

---

## 1. A Planta da Casa (Arquitetura e Organização)

_Se a gente não arrumar o quarto hoje, amanhã ninguém acha a meia._

Antes de escrever uma única linha de código, decidimos como o projeto será organizado. Decisões aqui custam pouco agora e economizam meses de refatoração.

### Qual linguagem, framework e bibliotecas o time vai usar?

A fundação técnica do projeto.

- **Stack padronizada (linguagem + framework + libs principais definidos).**
  > 💡 Motivo: padronização garante onboarding rápido, code review previsível e contexto coerente para a IA. Stack TypeScript end-to-end para máximo aproveitamento de tipos.

**Stack definida:**

- **Linguagem:** TypeScript (estrito; `strict: true`).
- **Framework principal (frontend + backend):** **Next.js 16** (App Router, React Server Components, Turbopack default, `cookies()` async, `middleware` → `proxy`). _Confirmado em 2026-05-06: pacote real instalado é `next@16.x` + `react@19`._
- **Banco de dados:** PostgreSQL via Supabase (project ref `qtzowpbrduzkbyvrzscu`).
- **ORM / Query builder:** Drizzle ORM + `postgres` (postgres-js) + drizzle-kit (migrations versionadas).
- **Auth:** **Custom — subdomínio (`crm_tenant`) + email + senha**, validados contra `clientes.senha` (admin do tenant) e `clientes.vendedores[].senha` (jsonb). Senha hasheada com bcrypt — **sem fallback de comparação direta desde 2026-05-07**, login só aceita hash `$2*`. Sessão em **JWT (jose) em cookie httpOnly, TTL 7 dias**. **Login segregado por audiência (2026-05-07):** cliente comum entra em `/login`; superadmin Groner em `/flows/login` (cada rota recusa a audiência da outra sem criar sessão). _Substitui a decisão anterior de Supabase Auth: a Groner usa subdomínio do cliente (`<tenant>.api.groner.app`) como discriminador, padrão que a Supabase Auth não cobre nativamente._
- **UI:** Tailwind CSS v4 + shadcn/ui (Radix Primitives) — paleta `emerald` built-in (verde Groner Flows). Dark mode único; tema claro e paleta teal customizada foram tentados e revertidos em 2026-05-06.
- **Estado client:** Zustand.
- **Estado server (data fetching):** TanStack Query (React Query) + Server Components.
- **Validação:** Zod (schemas compartilhados client/server).
- **API tipada:** tRPC.
- **Tempo real:** Supabase Realtime (Postgres subscriptions).
- **Storage:** Supabase Storage.
- **Workers/automação:** n8n self-hosted (`workflows.gronercrm.com.br`).
- **Observabilidade:** Sentry (erros + perf), Vercel Analytics, PostHog (produto).
- **Hospedagem:** Vercel (frontend + edge) + Supabase (banco/auth/storage).

### Onde escrevemos as regras pesadas do app?

- **Service Layer (gaveta de Serviços).**
  > 💡 Motivo: regras de qualificação de lead, cálculo de agenda, roteamento entre vendedores e tratativas de CRM são complexas e vão crescer. Concentrar em `src/server/services/*` torna testável, reutilizável entre Server Actions / tRPC / cron jobs e mantém componentes/rotas finos.

### Como agrupamos nossos arquivos e pastas?

- **Por Assunto/Feature.**
  > 💡 Motivo: features bem delimitadas (`leads`, `agendamentos`, `agentes`, `clientes`, `usuarios`, `crm`) facilitam encontrar código, isolar testes e onboardear novos devs. Crescimento de domínio (multi-tenant SaaS) penaliza estrutura por tipo técnico.

```
src/
  app/
    (app)/                 # route group autenticado (layout aplica AppShell + auth guard)
      layout.tsx
      dashboard/
      automacoes/
      usuarios/
      agendamentos/
      prompts/
      perfil/
    login/                 # rota pública (Server Action loginAction)
    layout.tsx             # root layout (PT-BR, dark, Geist)
    page.tsx               # / → redirect login/dashboard
  components/              # AppShell, Sidebar, Header, LogoutButton, PageHeader
  lib/
    db/                    # Drizzle schema + postgres-js client (singleton)
    auth/                  # session.ts (jose JWT), login.ts (loginWithSubdomain)
    supabase/              # clients reservados (futuro)
    cn.ts
  server/
    services/              # regras de negócio: dashboard.ts, agentes.ts, usuarios.ts, agendamentos.ts
```

**Padrão de página autenticada:** o `layout.tsx` do route group `(app)/` valida sessão e aplica `AppShell`. Cada `page.tsx` chama o service correspondente em `src/server/services/<feature>.ts` e renderiza Server Components. Nunca consultar DB direto da página — sempre via service. Componentes interativos pequenos viram Client Components (`"use client"`).

### Textos e Status "Mágicos" (ex: "PAGO", "PENDENTE")

- **Dicionário (Enums/Constantes).**
  > 💡 Motivo: status de lead/agendamento/follow-up são pivôs do negócio. Centralizar em `src/lib/enums.ts` (e Postgres `CREATE TYPE` quando fizer sentido) elimina typos e dá autocomplete. Zod valida nas bordas.

### Como nomeamos as coisas no código?

- **Padronizado: Inglês `camelCase` no código TypeScript; `snake_case` nas tabelas/colunas Postgres.**
  > 💡 Motivo: convenção dominante do ecossistema TS/Next + convenção SQL/Postgres. Drizzle mapeia automaticamente.

### Como lidamos com ferramentas de terceiros (ex: Stripe, Correios)?

- **Adapters / Interfaces.**
  > 💡 Motivo: dependemos de múltiplos CRMs externos (Groner CRM e potencialmente outros), provedores de WhatsApp (Z-API/Uazapi/Evolution) e LLMs. Adapters em `src/server/integrations/<provider>/` permitem trocar provedor sem tocar service layer.

### O sistema tem planos com limites de uso (ex: Free, Pro, Enterprise)?

- **Limites por plano (Usage Limits).**
  > 💡 Motivo: SaaS B2B com cobrança por cliente. Tabela `plans` + `client_plan_limits` (limites de leads/mês, agentes ativos, integrações) decididas no dia zero — refatorar depois é caro.

### O sistema precisa emitir Nota Fiscal ou boleto?

- **Não por agora.**
  > 💡 Motivo: faturamento atual é manual (Groner emite NF do contrato com o cliente). Modelar `cnpj`, `razao_social`, `endereco_fiscal` em `clientes` desde já para integração futura sem refatoração.

### Como organizamos os repositórios do projeto?

- **Monorepo (Turborepo + pnpm workspaces).**
  > 💡 Motivo: app web + workflows n8n exportados + scripts de migração + tipos compartilhados convivem melhor num repo só. Mudanças que tocam schema → service → UI viram PR único e atômico.

```
groner-projetos/novo-sdr/
  apps/
    web/                   # Next.js
  packages/
    db/                    # Drizzle schema + migrations
    types/                 # tipos/enums compartilhados
    integrations/          # adapters CRM/WhatsApp/LLM
  ops/
    n8n/                   # workflows exportados (versionados)
    sql/                   # scripts SQL ad-hoc
```

---

## 💾 2. O Baú do Tesouro (Banco de Dados)

_Seus dados são sagrados._

### Qual o tipo de banco de dados principal do projeto?

- **PostgreSQL (Supabase).**
  > 💡 Motivo: dados altamente relacionais (clientes ↔ usuarios ↔ leads ↔ agendamentos), JSONB para configurações flexíveis, RLS nativo para multi-tenancy, FTS embutido. Já é a infraestrutura do projeto.

**Banco escolhido:** PostgreSQL via Supabase (`qtzowpbrduzkbyvrzscu`). Conexão via pooler `aws-1-us-east-1.pooler.supabase.com:5432`.

### Quando o usuário clica em "Excluir Conta"?

- **Soft Delete (`deleted_at timestamptz NULL`).**
  > 💡 Motivo: leads e agendamentos têm valor histórico (auditoria, métricas, recuperação acidental). Hard delete em cascata destruiria séries históricas. Política de retenção: 90 dias após `deleted_at` antes de purga real (rotina cron).

### Quem é o segurança da porta dos dados?

- **Banco também (Constraints).**
  > 💡 Motivo: defesa em profundidade. App valida via Zod nas bordas; banco rejeita lixo via `NOT NULL`, `CHECK`, `FOREIGN KEY`, `UNIQUE`. Já temos FKs com `ON DELETE` definido em `agentes`, `usuarios`, `leads`, `agendamentos`.

### Como guardamos dados muito variados (ex: Preferências de Tema)?

- **Híbrido: colunas dedicadas para campos consultáveis + JSONB para configurações realmente variáveis.**
  > 💡 Motivo: status_id, etapa_id, telefone — colunas. Configurações de agendamento (slots, turnos, antecedência), integrações por agente — `configuracoes jsonb` com índice GIN quando consultado.

### Listas muito grandes (ex: Feed com 10 mil posts)

- **Cursor (keyset pagination).**
  > 💡 Motivo: lead/conversa cresce sem limite. Offset degrada após algumas dezenas de milhares; cursor por `(created_at, id)` é constante. Padrão obrigatório em listagens server-side.

### E se a gente precisar adicionar tabelas novas?

- **Migrations (drizzle-kit + Supabase migrations).**
  > 💡 Motivo: schema versionado no repositório, replicável em dev/staging/prod, revisado em PR. Rollback documentado.

### Onde fazemos as contas (ex: "Soma o total de vendas do mês")?

- **No Banco (SQL: views materializadas, agregações, `pg_stat_statements`).**
  > 💡 Motivo: agregar mil leads no Node é desperdício. Postgres faz em milissegundos com índices certos. Para dashboards: views materializadas refrescadas por cron.

### Precisamos saber quem mudou o quê e quando?

- **Audit Log (tabela `audit_log` + triggers Postgres).**
  > 💡 Motivo: leads movidos de etapa, agendamentos remarcados, agentes editados — disputas e debug exigem histórico. Trigger genérica grava `(table, row_id, action, before, after, user_id, ts)`.

### O sistema atende uma empresa ou várias ao mesmo tempo?

- **Multi-tenant (várias empresas isoladas).**
  > 💡 Motivo: produto é SaaS. Toda tabela de domínio carrega `cliente_id`. Isolamento garantido por **RLS no Postgres** (não confiar só na app layer).

### As tabelas foram normalizadas ou ficamos com dados repetidos?

- **Normalizado (3NF).**
  > 💡 Motivo: dados do CRM mudam (status, etapas, vendedores). Repetir = bug de consistência. Desnormalização pontual permitida depois, com justificativa de performance medida.

### Como as tabelas se "conversam" no banco?

- **Foreign Keys reais com `ON DELETE` explícito.**
  > 💡 Motivo: `cliente_id → clientes` CASCADE, `vendedor_id → usuarios` SET NULL, `agendamento_id → agendamentos` SET NULL, `lead_id → leads` CASCADE. Banco rejeita órfãos.

### Escrevemos SQL na mão ou usamos um "Tradutor" (ORM)?

- **ORM (com escape para SQL puro quando necessário).**
  > 💡 Motivo: produtividade + tipagem do schema → tipos TS automáticos. Para queries complexas (relatórios, FTS), escrever SQL puro via `db.execute(sql\`...\`)`.

### Qual ORM, query builder e ferramenta de migration o time vai adotar?

**Ferramentas definidas:**

- **ORM / Query builder:** Drizzle ORM.
- **Migration tool:** drizzle-kit (gera migrations a partir do schema TS) + Supabase migrations CLI para mudanças aplicadas via dashboard.

> 💡 Motivo: Drizzle é TS-first, gera tipos do schema, sintaxe próxima de SQL e roda igual em edge runtimes. Sem mágica do Prisma e sem overhead de runtime.

### Quais colunas têm índice no banco?

- **Índices estratégicos.**
  > 💡 Motivo: PKs (automático), FKs (criados manualmente — Postgres não cria), colunas usadas em `WHERE`/`ORDER BY` frequente.

**Índices já criados no projeto (2026-05-06):**

- `agentes(cliente_id)`, `usuarios(cliente_id)`, `leads(cliente_id, vendedor_id, agendamento_id)`, `agendamentos(lead_id)`.

**Próximos a avaliar:** `leads(telefone)`, `leads(lead_id)` (CRM ext), `leads(proximo_followup) WHERE status_followup = 'pendente'`, `audit_log(table_name, row_id, ts)`.

### E se duas operações no banco precisam acontecer juntas ou não acontecem?

- **Transactions.**
  > 💡 Motivo: criar lead + agendamento + atualizar status no CRM tem que ser atômico. Drizzle expõe `db.transaction(async (tx) => ...)`.

---

## ⚡ 3. A Velocidade da Luz (Performance e Filas)

_O usuário tem paciência zero._

### Tarefas que demoram (Gerar relatórios, mandar E-mail)

- **Fila de Background (n8n + futuro Inngest/Trigger.dev).**
  > 💡 Motivo: chamadas a CRM, envio de mensagens WhatsApp via Z-API, geração de relatórios — tudo assíncrono. n8n já é a infra de orquestração; jobs in-app via Inngest na fase 2.

### O App bombou na Home! Como aliviar?

- **Cache (Next.js `unstable_cache` + ISR + Redis na fase 2).**
  > 💡 Motivo: dashboards de cliente tendem a ser cacheáveis por usuário/cliente com revalidação curta (30-60s). Redis (Upstash) entra quando volume justificar.

### Problema do N+1 (Consultas repetidas no banco)

- **Eager Loading (Drizzle relations API).**
  > 💡 Motivo: listagem `leads` + `vendedor` + `cliente` com Drizzle `with: { vendedor: true, cliente: true }` vira 1 query com JOINs.

### Tamanho das imagens dos usuários (Avatar/Fotos)

- **Comprime na porta (Supabase Storage transforms).**
  > 💡 Motivo: avatares e mídias de WhatsApp passam por transform `?width=256&quality=80&format=webp` no Supabase Storage. Limite de upload: 2MB no client.

### Se a API externa (Correios/ChatGPT) cair?

- **Plano B (fallback + retry exponencial + circuit breaker).**
  > 💡 Motivo: Groner CRM, OpenAI, Z-API caem. Padrão: retry 3× com backoff exponencial (1s/4s/16s), circuit breaker abre após 5 falhas em 60s, fallback para mensagem amigável e log do erro com Trace ID.

### O usuário afobado (Clica 10x no botão de Comprar)

- **Debounce + idempotency keys.**
  > 💡 Motivo: botões críticos (criar agendamento, mover lead) desabilitam no primeiro clique. Server Actions/tRPC mutations recebem `idempotency_key` (ULID gerado no client) — repetições retornam o mesmo resultado.

### Como o usuário encontra conteúdo dentro do app?

- **Postgres FTS (`tsvector` + GIN) com pg_trgm para fuzzy.**
  > 💡 Motivo: busca por lead (nome, telefone, observações) cabe em Postgres FTS. Migrar para Meilisearch/Typesense só se latência ou volume exigirem.

---

## 🔒 4. Os Seguranças da Balada (Segurança)

_Proteger os dados é mais barato do que pagar advogado depois._

### Como o app lembra quem fez Login?

- **JWT assinado (HS256 via `jose`) em cookie `novosdr_session` httpOnly, SameSite=Lax, Secure em produção.**
  > 💡 Motivo: auth custom multi-tenant por subdomínio. JWT carrega `{kind, userId, clienteId, tenant, email, name}` — **`isSuperadmin` foi REMOVIDO do JWT em 2026-05-07** (sempre lido fresh do DB via `isSuperadminFresh`). TTL 7 dias. Segredo em `SESSION_SECRET` (≥32 chars). Sem token em localStorage.

### Onde guardamos as Chaves Secretas (Senha do Banco, API Keys)?

- **`.env` local + Variáveis de ambiente em produção.**
  > 💡 Motivo: `.env.local` ignorado pelo git, `.env.example` no repo com chaves vazias. Produção: Vercel Environment Variables (separadas por ambiente). Supabase Vault para chaves usadas dentro do banco.

### Como as chaves secretas chegam ao servidor de produção?

- **Vercel Environment Variables + GitHub Actions secrets.**
  > 💡 Motivo: time pequeno (1-3 devs no MVP), Vercel é a plataforma. Para o CI (GitHub Actions), `secrets.*`. Migração para Doppler/1Password Secrets fica como next step quando o time crescer ou houver requisito de auditoria.

### Como guardamos a senha do Joãozinho?

- **Hash bcrypt (custo 10–12) na coluna `clientes.senha` (varchar) e em `clientes.vendedores[].senha` (jsonb). Login rejeita qualquer credencial que não comece com prefixo `$2*` desde 2026-05-07.**
  > 💡 Motivo: como a auth é custom, o app gera o hash via `bcryptjs` antes de salvar. Hashes válidos começam com `$2`. **Migração:** durante o seed inicial admite-se senha em texto puro (comparação direta) — substituir por hash assim que houver fluxo de signup/reset.

### Controle de Acesso (Quem pode apagar um post?)

- **Policies em camada dupla: RLS no Postgres (futuro) + guards no service layer (`requireOwner`/`isOwner`).**
  > 💡 Motivo: regra do produto exige isolamento estrito. Política `cliente_id = auth.cliente_id()` em toda tabela (RLS, fase 2). Vendedor só vê leads onde `vendedor_id = auth.uid()`. Cliente vê todos os leads do tenant. **Mutação restrita a `kind=cliente`** via `requireOwner(session)` em todas as Server Actions de edição/criação. UI esconde botões "Editar" via `isOwner(session)`. Nunca confiar só no app — RLS entra para fechar a defesa em profundidade.

### Defesa contra formulários fantasmas (CSRF/CORS)

- **Só entra convidado.**
  > 💡 Motivo: Next.js Server Actions têm proteção CSRF nativa (origin/host check). CORS restrito ao domínio do app + domínios n8n autorizados.

### O cara que muda o ID da URL (IDOR)

- **Confere identidade.**
  > 💡 Motivo: RLS bloqueia em primeira camada (banco). Service layer valida ownership novamente antes de retornar. Camada dupla obrigatória.

### O usuário entra com Google, Apple ou cria senha própria?

- **Senha própria, vinculada a subdomínio do cliente (`<tenant>.api.groner.app`).**
  > 💡 Motivo: arquitetura multi-tenant Groner já é por subdomínio (ex.: `looper.api.groner.app`). Login pede `subdomínio + email + senha`. Google OAuth pode entrar na fase 2 (mapear identidade Google → usuário com `cliente_id`). Apple/Microsoft sob demanda.

### O usuário fica logado para sempre?

- **Expiração automática (rolling 30 dias com refresh).**
  > 💡 Motivo: padrão do Supabase. JWT curto (1h) + refresh token rolling. Logout invalida sessão.

### O app vai exigir uma segunda confirmação de identidade (2FA)?

- **Sim, TOTP via Supabase MFA.**
  > 💡 Motivo: **obrigatório para usuários com role `admin` ou `cliente_owner`**, opcional para vendedores. Dados envolvem leads de clientes finais (LGPD) e movimentações no CRM externo — invasão custa caro.

### O que acontece se alguém tentar adivinhar a senha errada mil vezes?

- **Rate limiting + bloqueio temporário.**
  > 💡 Motivo: Supabase já aplica rate limit em endpoints de auth. Adicionar bloqueio por conta após 5 tentativas falhas em 15min (via tabela `auth_failures` + middleware) e CAPTCHA (hCaptcha) após o segundo bloqueio.

### Como o usuário recupera a conta se esquecer a senha?

- **Link com expiração por e-mail (Supabase magic link, 30min, uso único).**
  > 💡 Motivo: padrão do Supabase Auth. Token assinado, invalidado após uso ou expiração.

---

## 🎨 5. A Cara do App (Comunicação Front e Back)

_Como a tela "conversa" com o motor._

### O usuário vai acessar pelo celular, computador ou pelos dois?

- **Web responsiva (mobile + desktop).**
  > 💡 Motivo: vendedores usam celular no campo, gestores usam desktop. Next.js + Tailwind responsivo cobre os dois. PWA na fase 2 se houver demanda por instalação.

### O App é uma página que se monta no navegador ou no servidor?

- **Renderização no Servidor (Next.js App Router — Server Components + streaming).**
  > 💡 Motivo: SEO não é crítico (app interno), mas SSR oferece TTFB baixo, payload menor, segurança (queries no servidor) e melhor experiência em 3G. Client Components onde houver interatividade pesada.

### O que o back-end devolve quando tudo dá certo?

- **Envelope padrão `{ data, meta }`.**
  > 💡 Motivo: previsível para o frontend. `meta` carrega cursor, total, hints. tRPC já entrega tipado; em rotas REST públicas (webhooks), envelope explícito.

### O que o back-end devolve quando dá ERRO (ex: CPF inválido)?

- **Mapa de erros estruturado.**

```ts
{ error: { code: "VALIDATION_ERROR", message: "...", fields: { telefone: "Formato inválido" } } }
```

> 💡 Motivo: front pinta o campo exato. Códigos de erro (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`) padronizados em `src/lib/errors.ts`.

### O Front-end pede uma busca com 3 filtros. Como ele manda isso?

- **Query GET (`?status=qualificado&vendedor=10&cursor=...`).**
  > 💡 Motivo: links compartilháveis, cacheáveis por CDN, debugáveis no DevTools. POST só para mutations e para queries com payload >2KB.

### Se precisarmos mudar muito o App no futuro? (Versionamento)

- **Versões `/api/v1/...` apenas para endpoints públicos (webhooks, integrações de cliente).**
  > 💡 Motivo: tRPC interno (consumido pelo Next) não precisa de versionamento — front e back deployam juntos. APIs públicas (webhooks de CRMs externos) ficam em `/api/v1/` para não quebrar integrações.

### Como o Back avisa o Front das rotas que existem?

- **Tipos automáticos (tRPC) + OpenAPI gerado para endpoints públicos.**
  > 💡 Motivo: tRPC infere tipos client-side em compile time — sem doc para manter. Para endpoints REST públicos, `trpc-openapi` ou Zod-to-OpenAPI gera spec auto.

### De onde vêm os botões, modais e tabelas do app?

- **Biblioteca pronta (shadcn/ui sobre Radix + Tailwind).**
  > 💡 Motivo: shadcn copia componentes para o repo (controle total) sobre Radix (acessibilidade WCAG nativa). Velocidade + customização.

### Qual o estilo de comunicação entre front-end e back-end?

- **tRPC para API interna; REST para webhooks externos.**
  > 💡 Motivo: stack TS full-stack — tRPC elimina contrato manual e dá tipos end-to-end. REST só onde sistemas externos esperam (CRM webhooks, integrações).

### Como o front-end gerencia o estado global da aplicação?

- **Zustand (UI state) + TanStack Query (server state).**
  > 💡 Motivo: separação clara: TanStack Query cuida de cache/revalidação/refetch de dados do servidor; Zustand cuida de filtros, modais, preferências de UI. Sem Redux.

---

## 🚨 6. Quando a Casa Cai (Erros, Logs e Alertas)

_Vai dar erro. A questão é como a gente lida com ele._

### A tela quebrou (Erro 500). O que o usuário enxerga?

- **"Ops" amigável + Trace ID.**
  > 💡 Motivo: Sentry gera `event_id`, exibido na página de erro do Next.js (`error.tsx`). Suporte usa o ID para localizar evento exato.

### Onde a gente anota (Log) os erros do sistema?

- **Sentry (erros + performance) + Vercel Logs (HTTP) + Supabase Logs (DB).**
  > 💡 Motivo: Sentry captura unhandled errors, source maps, contexto de usuário/cliente. Vercel Logs guarda requests. Supabase expõe queries lentas e falhas de RLS.

### Como a gente sabe que o site caiu (Ficou Fora do Ar)?

- **Healthcheck (BetterStack ou UptimeRobot) + alertas Slack/Discord.**
  > 💡 Motivo: ping a cada 60s em rota `/api/health` que verifica DB + Auth. Falhas notificam canal `#groner-ops`.

### Conseguimos rastrear o tempo de resposta de cada rota e o que aconteceu em cada requisição?

- **APM/Tracing (Sentry Performance + Vercel Analytics).**
  > 💡 Motivo: Sentry transactions identificam rota lenta + spans (DB, fetch externo). OpenTelemetry exportado para Sentry quando precisarmos correlacionar com n8n.

### O que a gente NÃO PODE botar nos Logs de erro?

- **Sanitize (filtro de segredos).**
  > 💡 Motivo: Sentry config `beforeSend` mascara `password`, `token`, `cpf`, `cnpj`, `cartao`, `cvv`, headers `Authorization`, `Cookie`. Conformidade LGPD.

---

## 🤝 7. Trabalho em Equipe (Git e Deploy)

### Como a gente junta o código da galera?

- **Pull Request (trunk-based, branches curtas).**
  > 💡 Motivo: branches `feat/`, `fix/`, `chore/` curtas (<3 dias), 1 aprovação, merge em `main`, deploy automático. Sem long-lived `develop`.

### Mensagens de Salvar o código (Commits)

- **Conventional Commits.**
  > 💡 Motivo: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Permite changelog automático e busca por tipo. Enforced via Husky + commitlint.

### Como o código sai do PC e vai pro Servidor (Deploy)?

- **CI/CD (Vercel + GitHub Actions).**
  > 💡 Motivo: Vercel deploya automaticamente cada PR (preview URL) e `main` (produção). GitHub Actions roda lint/typecheck/test antes do merge.

### O que a gente faz se o deploy quebrar produção?

- **Rollback documentado (Vercel "Promote to Production" da versão anterior).**
  > 💡 Motivo: Vercel mantém todos os deploys; rollback é 1 clique. Para banco: migrations sempre reversíveis (`up` + `down`); incidente tem playbook em `ops/runbook.md`.

### Quando uma tarefa (Card) está "Pronta" (Definition of Done)?

- **Tudo passou + revisado + preview validado.**

DoD do projeto:

- [ ] PR aberto contra `main` com descrição
- [ ] CI verde (typecheck, lint, testes)
- [ ] Preview Vercel testado pelo autor
- [ ] 1 aprovação humana
- [ ] Sem TODOs sem issue
- [ ] Migration aplicada em staging antes de prod
  > 💡 Motivo: previne "funciona na minha máquina" e descobre bug em preview, não em prod.

### Os ambientes de teste e produção são separados?

- **Separados (dev local / staging / produção).**
  > 💡 Motivo: 3 projetos Supabase distintos (dev, staging, prod) ou ao menos 2 (staging + prod) + dev local via Supabase CLI. Evita poluir prod com dados de teste.

### Se o banco explodir hoje, quando voltamos ao ar?

- **Backup automático (Supabase backups diários + PITR).**
  > 💡 Motivo: Supabase Pro plan habilita Point-in-Time Recovery (até 7 dias atrás) e daily backups (30 dias). RTO meta: <2h. RPO meta: <5min (com PITR).

---

## 🧪 8. Testes e Garantia da Vibe (Qualidade)

### Qual a nossa regra de Testes Automatizados?

- **Caminho feliz dos fluxos críticos (E2E + integração).**

Cobertura mínima:

- E2E (Playwright): login, criar lead, mover lead entre etapas, agendar reunião.
- Integração (Vitest + DB de teste): RLS, queries Drizzle, services.
- Unit (Vitest): utilitários puros, validators.

> 💡 Motivo: 100% de cobertura é vaidade. Cobrir fluxos que dão dinheiro/quebram negócio se quebrarem.

### Code Review (Revisão pelo Amigo)

- **Aprovação obrigatória.**
  > 💡 Motivo: PR sem review = bug em produção. Auto-merge desabilitado em `main`.

### Formatador de Código (Linting)

- **Prettier + ESLint + Husky + lint-staged.**
  > 💡 Motivo: pre-commit roda Prettier + ESLint --fix + typecheck nos arquivos staged. CI roda tudo. Sem discussão de estilo em review.

### Testar pagamentos e integrações perigosas

- **Sandbox + cartões de teste.**
  > 💡 Motivo: gateway (Pagar.me/Stripe) tem ambiente test. Z-API tem instância de homologação. CRM Groner: instância de staging com tenant `qa-*`.

### O app precisa funcionar para pessoas com deficiência?

- **WCAG AA (Radix Primitives + audit Lighthouse).**
  > 💡 Motivo: Radix entrega aria/keyboard nav out-of-the-box. CI roda Lighthouse-ci com threshold a11y ≥90. Contraste validado por design tokens.

### Como ativamos e desativamos features sem precisar de um novo deploy?

- **Feature flags via tabela `feature_flags` no banco (fase 1) → PostHog (fase 2).**
  > 💡 Motivo: tabela com `(feature_key, cliente_id, enabled, rollout_pct)` resolve 80% dos casos sem custo extra. PostHog quando precisarmos de A/B test estatístico.

---

## ☁️ 9. Nuvem, Arquivos e Infra

### Onde a gente salva as fotos e PDFs dos usuários?

- **Supabase Storage.**
  > 💡 Motivo: integrado ao Auth/RLS, transforms nativos, CDN global. Buckets por contexto: `avatars`, `whatsapp-media`, `documents`. Políticas de acesso espelham RLS do banco.

### Como o projeto roda no computador de um desenvolvedor novo?

- **Docker Compose + script de setup.**

```
git clone ... && cd novo-sdr/apps/web
cp .env.example .env.local
pnpm install
pnpm db:migrate
pnpm dev
```

> 💡 Motivo: Supabase CLI sobe Postgres + Studio + Auth localmente via Docker. `pnpm setup` script automatiza primeiro run.

### A grande divisão: Como organizamos o projeto todo?

- **Monolito majestoso (Next.js fullstack).**
  > 💡 Motivo: 1-3 devs, MVP. Microserviços agora seria autossabotagem. Quando módulos específicos exigirem isolamento (ex: motor de IA pesado), extrair como Edge Function ou app separado.

### O app precisa funcionar sem internet?

- **Não.**
  > 💡 Motivo: app de gestão online. Sem caso de uso offline justificado.

### Quem cuida de atualizar as bibliotecas e corrigir vulnerabilidades?

- **Renovate Bot.**
  > 💡 Motivo: PRs automáticos agrupando minor/patch + alertas para major. Dependabot é alternativa.

### Como entregamos os arquivos estáticos (JS, CSS, imagens) aos usuários?

- **Vercel Edge Network (CDN incluso).**
  > 💡 Motivo: Vercel já entrega bundles + imagens otimizadas via Edge. Cloudflare na frente do domínio para WAF/anti-DDoS.

---

## ⏱️ 10. Tempo Real e Rotinas (Cron & Real-time)

### Atualizações em tempo real (ex: Nova mensagem no chat)

- **WebSockets via Supabase Realtime.**
  > 💡 Motivo: subscrições Postgres já entregam eventos de INSERT/UPDATE/DELETE com filtros de RLS aplicados. Sem servidor extra.

### Avisos de Terceiros (ex: MercadoPago avisando do pagamento)

- **Webhooks (rotas Next.js `/api/webhooks/<provider>` + verificação de assinatura).**
  > 💡 Motivo: cada provider (CRM Groner, Z-API/Uazapi, gateway) tem rota dedicada que valida assinatura HMAC antes de enfileirar processamento.

### Tarefas que rodam sozinhas (ex: Cobrar mensalidade)

- **Cron (Supabase pg_cron + n8n schedules).**
  > 💡 Motivo: rotinas de DB (refresh views, purga soft-delete) em pg_cron. Rotinas de negócio (follow-up, cobrança, sync CRM) em n8n schedules.

---

## 📊 11. Dados, Métricas e Conhecimento

### Histórico de ações (Ex: Cliques, visualizações de tela)

- **PostHog.**
  > 💡 Motivo: produto + analytics + session replay + feature flags em uma ferramenta. Self-host ou cloud.

### Defesa contra "Robôs e Raspadores" (Scraping)

- **Rate limit (Vercel + middleware) + Cloudflare WAF.**
  > 💡 Motivo: rate limit por IP/usuário em rotas públicas (`/api/webhooks/*`, login). Cloudflare na frente bloqueia padrões abusivos.

### A Regra do Escoteiro (Refatoração)

- **Melhoria contínua (Boy Scout Rule).**
  > 💡 Motivo: refatoração nasce com a feature que toca o código. ADRs em `docs/adr/` para decisões grandes. Big Bang rewrite proibido.

### O "Fator Ônibus"

- **README + CONSTITUICAO + ADRs + Notion.**
  > 💡 Motivo: `README.md` na raiz com setup e arquitetura; `CONSTITUICAO.md` para decisões/credenciais/problemas&soluções; `docs/adr/NNNN-decisao.md`; Notion (NOVO SDR) para acompanhamento de produto.

### O app coleta dados de rastreio ou analytics?

- **Banner de consentimento + Política de Privacidade (LGPD).**
  > 💡 Motivo: PostHog/analytics só ativam após consentimento. Política em `/legal/privacidade` com bases legais explícitas.

---

## 🌍 12. Internacionalização e Localização

### O app vai suportar múltiplos idiomas?

- **PT-BR único, mas i18n-ready (next-intl + arquivos `messages/pt-BR.json`).**
  > 💡 Motivo: cliente alvo é Brasil. Custo zero adicionar inglês depois se nascermos com i18n. Textos hardcoded proibidos.

### Como exibimos datas, moedas e fuso horário?

- **UTC no banco, `Intl` no front, fuso `America/Sao_Paulo` por padrão.**
  > 💡 Motivo: `timestamptz` em todas as colunas de data. Conversão para fuso do cliente na renderização. `Intl.DateTimeFormat`/`Intl.NumberFormat` com locale `pt-BR`.

---

## 📣 13. Comunicação com o Usuário

### Como o app envia e-mails transacionais (confirmações, alertas, senhas)?

- **Serviço dedicado (Resend).**
  > 💡 Motivo: SDK enxuto, DKIM/SPF/DMARC fáceis, painel claro, integra com React Email para templates tipados. Supabase Auth pode delegar envio via SMTP custom (Resend).

### E-mails de marketing e e-mails transacionais: mesmo servidor?

- **Domínios e provedores separados.**
  > 💡 Motivo: transacional sai de `noreply@app.gronercrm.com.br` (Resend); marketing eventual sai de `news.gronercrm.com.br` por outro provedor. Reputação de entrega não contamina.

### Como avisamos o usuário quando ele não está com o app aberto?

- **WhatsApp via integrações existentes (Z-API/Uazapi/Evolution) + Web Push (futuro).**
  > 💡 Motivo: produto já fala WhatsApp por design (SDR). Push web (PWA) na fase 2 se demanda surgir. SMS só para 2FA/segurança via Twilio sob demanda.

---

## 💳 14. Pagamentos e Recorrência

### Qual gateway de pagamento vamos usar?

- **Pagar.me (BR-first) — Stripe BR como alternativa.**
  > 💡 Motivo: clientes brasileiros, Pix/boleto/cartão nacional. Pagar.me tem assinaturas, splits, antifraude. Stripe BR só se houver expansão internacional.

### O app tem cobrança recorrente (assinatura)?

- **Assinatura recorrente.**
  > 💡 Motivo: SaaS B2B com mensalidade por cliente. Tabela `subscriptions(cliente_id, plan_id, status, current_period_end)` espelha estado do gateway via webhooks.

### O que acontece quando a cobrança falha?

- **Período de graça + tentativas automáticas (dunning do gateway).**
  > 💡 Motivo: 3 retries em 3/5/7 dias, e-mail + WhatsApp ao cliente, suspensão após 10 dias. Reduz churn involuntário.

### Como testamos o fluxo de pagamento em desenvolvimento?

- **Sandbox + cartões de teste.**
  > 💡 Motivo: Pagar.me/Stripe oferecem chaves test e cartões com cenários (aprovado, recusado, 3DS, fraude). E2E roda contra sandbox.

### Como tratamos pedidos de reembolso e chargebacks?

- **Fluxo definido (prazo, critérios, automação).**
  > 💡 Motivo: política em `/legal/reembolso` (prazo 7 dias arrependimento — CDC). Webhook de chargeback abre ticket interno + suspende cliente automaticamente até resolução.

---

## 🤖 15. Inteligência Artificial e LLMs

### Qual modelo e provedor de IA vamos usar?

- **API de provedor externo (Anthropic Claude + OpenAI como fallback).**
  > 💡 Motivo: Claude já é a base do agente Groner; OpenAI como fallback de resiliência. Self-host só se volume justificar GPU dedicada.

### Onde ficam os prompts do sistema?

- **Versionados no banco (tabela `agentes.prompt`) + histórico em `prompt_versions`.**
  > 💡 Motivo: já modelado — `agentes.prompt` é editável por cliente sem deploy. Versões anteriores em `prompt_versions(agente_id, version, prompt, created_at, created_by)` para rollback.

### Como controlamos os custos de tokens?

- **Limites por plano + monitoramento (LangSmith ou Helicone).**
  > 💡 Motivo: tabela `client_plan_limits` define mensagens/mês. Helicone (proxy) loga cada call com custo, latência, tokens — dashboards por cliente. Alerta no Slack se cliente passar 80% do limite.

### O que pode e o que não pode ir no contexto enviado à IA?

- **Política de sanitização.**

Mascarar antes de enviar ao LLM:

- CPF/CNPJ → `***`
- Telefone → últimos 4 dígitos
- Tokens/senhas → nunca
- E-mail → opcional (mascarado por padrão)
  > 💡 Motivo: LGPD + termos contratuais com provider. Opt-out de treinamento contratualmente confirmado (Anthropic/OpenAI Enterprise).

### O que o sistema faz quando a API da IA está lenta ou indisponível?

- **Fallback gracioso (timeout + retry exponencial + circuit breaker).**
  > 💡 Motivo: timeout 30s; retry 2× (3s/12s); após 5 falhas em 1min, circuit breaker abre por 5min e usa resposta degradada ("Estou com lentidão, em instantes te respondo"). Fallback para OpenAI se Anthropic estiver fora.

---

## 🗺️ Resumo das Decisões

| # | Seção | Decisão Principal |
|---|---|---|
| 1 | Arquitetura | **Next.js 16** + TS + Supabase (DB) + Drizzle + tRPC; Service Layer; pastas por feature; Monorepo Turborepo |
| 2 | Banco | Postgres (Supabase); soft delete; multi-tenant com RLS; Drizzle ORM; FKs reais; transactions |
| 3 | Performance | n8n como queue; Next cache + Redis fase 2; eager loading Drizzle; FTS Postgres |
| 4 | Segurança | **Auth custom: subdomínio + email + senha (bcrypt) + JWT em cookie httpOnly**; RLS+IDOR check duplo; 2FA TOTP obrigatório admins (fase 2); Resend para reset |
| 5 | Front/Back | SSR (RSC); tRPC interno + REST público; envelope `{data,meta}`; shadcn/ui; Zustand + TanStack Query |
| 6 | Erros/Logs | Sentry + Vercel Logs + Supabase Logs; healthcheck BetterStack; sanitize PII |
| 7 | Git/Deploy | Trunk-based + Conv. Commits; Vercel + GitHub Actions; staging separado; PITR Supabase |
| 8 | Testes | Playwright E2E + Vitest; Husky+lint-staged; WCAG AA; feature flags em DB |
| 9 | Infra | Supabase Storage; Docker Compose dev; monolito Next; Renovate; Vercel CDN |
| 10 | Realtime/Cron | Supabase Realtime; webhooks com signature; pg_cron + n8n schedules |
| 11 | Métricas/Cultura | PostHog; rate limit + Cloudflare; Boy Scout Rule; ADRs + CONSTITUICAO + Notion |
| 12 | i18n | PT-BR + i18n-ready (next-intl); UTC no banco + Intl no front |
| 13 | Comunicação | Resend transacional; WhatsApp via integrações existentes; push web fase 2 |
| 14 | Pagamentos | Pagar.me; assinatura recorrente; dunning + grace period; sandbox |
| 15 | IA/LLM | Anthropic Claude (+OpenAI fallback); prompts versionados em DB; Helicone para custos; sanitização PII; circuit breaker |

---

## Performance — issues conhecidos (2026-05-06)

| # | Issue | Local | Impacto medido | Status |
|---|---|---|---|---|
| P1 | 10 queries Postgres sequenciais | `apps/web/src/server/services/dashboard.ts:70..194` | ~1.2s/hit do dashboard (warm) | ✅ aplicado 2026-05-06 |
| P2 | Handshake pool postgres-js a frio | `apps/web/src/lib/db/client.ts` (sem `instrumentation.ts`) | +1.3s na 1ª request pós-boot | ✅ aplicado 2026-05-06 |
| P3 | `.stagger` delays até 320ms + `opacity:0` | `apps/web/src/app/globals.css:170-180` | LCP +500–700ms | ✅ aplicado 2026-05-06 |
| P4 | `next.config.ts` vazio | sem `serverExternalPackages: ['postgres']` nem `optimizePackageImports: ['lucide-react']` | 50–200ms compilação Turbopack | ✅ aplicado 2026-05-06 |
| P5 | `readSession` duplicado layout+page | `(app)/layout.tsx` + cada `page.tsx` | 3ms total (negligível) | ✅ aplicado 2026-05-06 (`cache()` do React) |
| P6 | CSS `body::after` SVG noise + `mix-blend-mode` | `globals.css:108-117` | Paint 5–30ms (M1: 5ms; Intel: 30ms+) | ⏳ secundário (não aplicado nesta rodada) |
| P7 | `backdrop-blur-md` em topbar sticky | `app-shell.tsx:23` | Jank em scroll, FPS 60→30 em GPU fraca | ⏳ secundário (não aplicado nesta rodada) |

**Princípio que ficou nítido neste exercício:** sempre medir DB com pool quente. Pool frio mascara ganho de paralelização porque cada conexão paga handshake TLS+auth ~130ms simultaneamente.

**Status:** P1–P5 aplicados em 2026-05-06 (executor + revisor + veredito). P6 (CSS atmosphere) e P7 (backdrop-blur sticky) **não aplicados** nesta rodada — secundários, ficam para quando houver feedback de jank em GPU específica. Detalhes em `CONSTITUICAO.md` seção "Performance — Laudo 2026-05-06" + entrada de changelog.

## Implementação atual (2026-05-06)

| Item | Estado |
|---|---|
| `apps/web` Next.js 16 scaffolded | ✅ |
| Drizzle schema + cliente singleton | ✅ (`src/lib/db/`) |
| Auth custom (subdomain + email + senha + bcrypt + JWT) | ✅ |
| Sidebar + AppShell + route group `(app)/` | ✅ |
| Login UI Groner Flows (paleta verde) | ✅ |
| Dashboard ligado ao banco (cards, funil, follow-ups, agentes) | ✅ |
| `/automacoes` (lista de agentes contratados) | ✅ |
| `/usuarios` (tabela com leads/conversão) | ✅ |
| `/agendamentos` (lista filtrável Próximos/Todos) | ✅ |
| `/prompts` + `/prompts/[id]` (read-only) | ✅ |
| `/perfil` (dump da sessão) | ✅ |
| Edição (apenas owner): cliente, usuário, agente, agendamento | ✅ |
| `requireOwner` / `isOwner` guards | ✅ |
| Busca global (debounced URL `?q=`) por página | ✅ |
| Modais 80% (`DetailModal`) com URL `?detail=<id>` | ✅ |
| Filtros de data em agendamentos (`from`/`to`) | ✅ |
| Logo Groner (sidebar + login) via `next/image` | ✅ |
| Avatar do usuário no rodapé da sidebar (link `/perfil`) | ✅ |
| Convenção de assets em `public/assets/{brand,illustrations,icons,og}` | ✅ |
| System prompt do agente Notion para gerar Fixes | ✅ (Notion) |
| Tema claro (default) + dark mode com toggle persistido em cookie | ❌ revertido (não ficou bom) |
| Tokens semânticos (`canvas`/`surface`/`border-soft`/`text-fg`/`brand-soft`) | ❌ revertidos (voltou a classes dark hardcoded) |
| **Paleta `groner` em `@theme inline`** alinhada à logo (teal) | ❌ revertida (não casou bem visualmente) |
| Paleta `emerald` (Tailwind built-in) | ✅ |
| Dark mode único (sem toggle) | ✅ |
| Tons de superfície verde-escuro (body `#091811` / sidebar `#0b2519` / card `#143a2c` / hover `#1b4536`) | ✅ (refinado abaixo) |
| **Token system completo (CSS vars `--ink-{0..5}`, `--mint-{50..900}`, `--fg-*`, `--b-*`)** | ✅ |
| **Instrument Serif (Google Fonts)** para headings + Geist Sans body + Geist Mono numerics | ✅ |
| **Atmosfera:** radial gradients + SVG noise overlay no body | ✅ |
| **Microinterações:** `lift-in` / `fade-in` / `scale-in` / `.stagger` (delay 40ms incremental) | ✅ |
| **Utilitários:** `.btn-primary` / `.btn-ghost` / `.input` / `.chip*` / `.kpi-card` (top gradient border) / `.surface` / `.label-eyebrow` / `.table-editorial` | ✅ |
| Direção estética: "Editorial Trading Terminal" (Stripe + Bloomberg + Linear) | ✅ |
| `<Switch>` component reutilizável (optimistic UI + Server Action) | ✅ |
| `/leads` (tabela editorial + modal + search + visibilidade owner/vendedor) | ✅ |
| `usuarios.role` (`owner` \| `vendedor`) + login flow com escalonamento | ✅ (migrado para JSON em `clientes.vendedores`) |
| `/usuarios/novo` (formulário de cadastro com select de nível) | ✅ (escreve no JSON) |
| Edit de usuário com select de role | ✅ (lê/escreve no JSON) |
| **Vendedores migrados de tabela `usuarios` para `clientes.vendedores` (jsonb)** | ✅ (reunião 2026-05-06) |
| Fetcher CRM (`fetchCrmFunisAction`) + UI de selectors em `/perfil/cliente` | ✅ refatorado para slots fixos |
| Validação de conexão CRM (`validateCrmConnectionAction` via `/api/conta/minhaConta`) com badge visual | ✅ |
| Picker modal de colunas CRM em `/perfil/cliente` (search funcional, filtro tempo real) | ✅ |
| Picker modal de funcionários CRM em `/usuarios/novo` (`fetchCrmUsuariosAction` via `/api/usuario`) | ✅ |
| **`crm_status_colunas`** (jsonb array `[{nome, id, slug, tipo}]`) — coluna unificada substitui as 3 antigas | ✅ |
| `tipo ∈ {inicial, qualificacao, desqualificacao}` classifica cada coluna | ✅ |
| Ordem canônica de chaves em objetos CRM: `nome → id → slug → tipo` | ✅ (helpers `normalizeSlot`/`normalizeSlotList`) |
| `CrmStatusSlots` (9 slots fixos agrupados por tipo; helper "Buscar do CRM" opcional) | ✅ |
| Parser CRM ajustado para shape real `{Content: [{etapa, status[]}]}` | ✅ |
| Visibilidade de tokens (`api_token`, `crm_token`) gated por `is_superadmin` | ✅ |
| Visibilidade por campo configurável via UI (flags por coluna) | ⏳ deferido |
| Tabela `usuarios` DROPADA (drop definitivo) | ✅ 2026-05-07 |
| Login segregado: `/login` (cliente comum) e `/flows/login` (superadmin) | ✅ 2026-05-07 |
| Sidebar consolidada pra superadmin: `Lojas`, `Usuários`, `Configurações` escondidos; novo item `Clientes` como hub | ✅ 2026-05-07 |
| Layout `(app)/flows/layout.tsx` é gate de `/flows/*` (`isSuperadminFresh`); não-super redireciona pra `/dashboard` | ✅ 2026-05-07 |
| `Vendedor` ganha `horarios: HorariosVendedor` (Partial<Record<DiaSemana, IntervaloHorario[]>>) e `created_at` obrigatório | ✅ 2026-05-07 |
| `Loja` ganha `cnpj?`, `telefone?`, `endereco?` como campos nomeados | ✅ 2026-05-07 |
| `createCliente` seta `crmStatusColunas: []` no insert (shape canonical) | ✅ 2026-05-07 |
| Limites validados em loja: `0 ≤ area_atuacao ≤ 500` km, `0 ≤ consumo_minimo ≤ 100000` | ✅ 2026-05-07 |
| `isSuperadmin` removido do JWT — sempre lido fresh do DB | ✅ 2026-05-07 |
| Menu Usuários `adminOnly` na sidebar | ✅ 2026-05-07 |
| Blocklist `__proto__`/`prototype`/`constructor` em mutations que mesclam FormData | ✅ 2026-05-07 |
| Validação `Date` em `updateAgendamento` (rejeita NaN) | ✅ 2026-05-07 |
| `nextVendedorId` via timestamp ms × 1000 + jitter (anti-colisão concorrente) | ✅ 2026-05-07 |
| `GRONER_INSTANCES_URL` env var (substitui hardcode AWS) | ✅ 2026-05-07 |
| Senha bcrypt obrigatória no login (sem fallback de texto puro) | ✅ 2026-05-07 |
| React 19: `useSyncExternalStore` em DebugProvider; derived state em SearchBox | ✅ 2026-05-07 |
| Dashboard kind=usuario fix: redireciona pra login quando cliente sumiu | ✅ 2026-05-07 |
| `importLojasFromCrmAction` faz merge por `crm_id` (não overwrite) | ✅ 2026-05-07 |
| `importUsuariosFromCrmAction` aceita `horarios` no payload | ✅ 2026-05-07 |
| Nomenclatura UI **Admin / Usuário** (DB mantém `owner` / `vendedor`) | ✅ |
| Coluna `clientes.is_superadmin` (CHECK só Looper) + flag na sessão | ✅ |
| Coluna `clientes.lojas` (jsonb array) + CRUD em `/perfil/cliente` | ✅ |
| Tela dedicada `/lojas` no menu lateral (reusa `LojasSection`) | ✅ |
| Lojas em tabela editorial + modal ao clicar (não mais cards inline) | ✅ |
| Campos extras em `lojas[*]` editáveis só por superadmin (pares chave/valor) | ✅ |
| Telas/rotas `/admin` para superadmin (cross-tenant) | ⏳ fase 2 |
| `/automacoes` view switcher Cards / Tabela via `?view=` | ✅ |
| Coluna `usuarios.recebe_agendamento` (boolean default true) + UI toggle | ✅ |
| Search-box: ícone lupa não sobrepõe placeholder (padding-left 36px) | ✅ |
| RLS em todas tabelas | ⏳ pendente |
| tRPC | ⏳ pendente (Server Actions usadas até agora) |
| Sentry + Resend + PostHog | ⏳ pendente |
| Husky + Prettier + ESLint + commitlint | ⏳ pendente |
| Staging Supabase separado | ⏳ pendente |
| **Componentes shared `data-table/`**: BooleanToggle, CopyButton, SecretActions, SecretInput, ColumnPicker<K>, TablePagination, JsonValidationModal, SearchableSelect<T,K>, IconEye/IconEyeOff/IconCopy/IconCheck/IconInfo/IconWarn | ✅ 2026-05-08 |
| **Helper PasswordConfirm** (`components/password-confirm.tsx`) — modal pra gate de privilege escalation | ✅ 2026-05-08 |
| **Padrão de tabelas editoriais** (single-line nowrap, ellipsis 25ch, lápis hover, edit inline expansível, drag/drop reorder, ColumnPicker, paginação 10/20/50/100 esquerda) aplicado em /clientes, /lojas, /usuarios | ✅ 2026-05-08 |
| **Coluna virtual Saúde** (pendências críticas) presente em todas tabelas editoriais | ✅ 2026-05-08 |
| **Coluna virtual Validação JSON** (super-only, drift detection + Aplicar shape canônico) em todas tabelas com jsonb | ✅ 2026-05-08 |
| **Indicador `ⓘ` amarelo** em células vazias relevantes (rgb(220,180,80)) | ✅ 2026-05-08 |
| **Loja.id (uuid)** adicionado em `clientes.lojas` jsonb. `LOJA_CANONICAL_KEYS` + `pickCanonicalLoja` preserva id existente | ✅ 2026-05-08 |
| **Vendedor.uid (uuid) + Vendedor.loja_ids: string[]** adicionados em `clientes.vendedores` jsonb. `VENDEDOR_CANONICAL_KEYS` + `pickCanonicalVendedor` | ✅ 2026-05-08 |
| **Backfill scripts** (`apps/web/scripts/backfill-{loja,vendedor}-ids.ts`) com dry-run + apply, idempotentes. npm scripts: `backfill:loja-ids[:apply]`, `backfill:vendedor-ids[:apply]` | ✅ 2026-05-08 |
| **Backfill executado**: 25 lojas em 18 clientes ganharam `id`; 57 vendedores em 18 clientes ganharam `uid` + `loja_ids` | ✅ 2026-05-08 |
| **Padrão de server actions tipadas** (`Result = {ok:true} | {ok:false; error}`) por entidade — clientes/lojas/vendedores | ✅ 2026-05-08 |
| **Privilege escalation password gate** — qualquer mudança em `is_superadmin` (criar/ativar/desativar) exige senha do super atuante via `verifySuperPasswordAction` + `PasswordConfirm` | ✅ 2026-05-08 |
| **SearchableSelect padrão** pra qualquer seleção de entidade — nunca `<select>` nativo. Memória `feedback_searchable_select_padrao.md` registrada | ✅ 2026-05-08 |
| **Coluna Status WhatsApp** em /clientes (super-only, auto-fetch on mount, erro detalhado em tooltip, click pra revalidar) | ✅ 2026-05-08 |
| **Modal CRM mapping** em /lojas (botão por linha, super-only): mostra valor atual × valor CRM, aplica só campos vazios sem sobrescrever | ✅ 2026-05-08 |
| **Modal "Buscar usuários da loja"** em /lojas: lista vendedores do CRM com mapping CRM → Groner + checkbox por usuário; importa via `createVendedorTyped` com `loja_ids: [loja.id]` | ✅ 2026-05-08 |
| **Modal "+ Nova loja"** auto-busca lojas do CRM ao escolher cliente; oferece importar 1, várias ou todas via checkbox | ✅ 2026-05-08 |
| **Modal de edição de loja em 3 abas** (Informações / Endereço / Configuração e agenda) com picker de loja embutido pra trocar sem fechar | ✅ 2026-05-08 |
| **Modal de edição de usuário em 2 abas** (Informações com acesso integrado / Horários com `UsuarioHorariosGrid` controlled e presets) | ✅ 2026-05-08 |
| **`/usuarios` recriado no padrão editorial** — colunas nome/email/telefone/função/lojas/ativo/recebe_agendamento/saude/validação. Permissões: super tudo, cliente kind=cliente edita, role=owner edita, role=vendedor read-only. Agrupar por loja (super-only) | ✅ 2026-05-08 |
| **Sidebar reordenada**: super (Flows → Clientes → Lojas → Cadastro → Dashboard → resto), cliente (Clientes → Lojas → Dashboard → resto). `/clientes` mudou de `superOnly` pra `adminOnly` | ✅ 2026-05-08 |
| **Auto-fetch on mount + erros nunca silenciosos** (status remotos como WhatsApp): tooltip detalhado + click pra retentar | ✅ 2026-05-08 |
| **Notion task tracking via MCP** (`fetch` → `data_source_id` → `notion-create-pages`). Database `[GESTAO] - Tarefas` (`69e9084b-98ef-83c8-9cb2-875991ecdfb8`); projeto `NOVO SDR` (`3589084b98ef8051a27dd76b6d13811c`). Tarefa criada: "Reset de senha de usuário → enviar via WhatsApp" (P3, Backlog) | ✅ 2026-05-08 |

## Próximos passos

1. Habilitar RLS por `cliente_id` em `clientes`, `usuarios`, `agentes`, `leads`, `agendamentos`.
2. Migrar Server Actions atuais (login, logout) + queries de service para tRPC quando houver mais de 5 endpoints.
3. Criar projeto Supabase de **staging** separado do prod.
4. Configurar Sentry + Resend + PostHog (chaves no Vercel).
5. Setup Husky/Prettier/ESLint/commitlint.
6. Definir DoD/PR template e abrir primeiro ADR (`0001-tech-stack.md`) referenciando este documento.

---

_Última atualização: 2026-05-08. Mudanças neste arquivo exigem PR + 1 aprovação + atualização sincronizada de `CONSTITUICAO.md` e `.specify/memory/constitution.md`._
