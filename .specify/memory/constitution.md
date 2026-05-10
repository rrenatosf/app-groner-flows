# NOVO SDR — Constitution (SpecKit memory)

> Lei do projeto. Tudo que SpecKit gerar (specs, plans, tasks) deve respeitar.
> Fontes da verdade complementares: [`/CONSTITUICAO.md`](../../CONSTITUICAO.md) (decisões + schema + fixes) e [`/TECH_STACK.md`](../../TECH_STACK.md) (decisões técnicas em modo `speckit.agent`).
> Atualizar este arquivo sempre que um princípio muda.

## Core Principles

### I. Multi-tenant por subdomínio (não-negociável)
Toda tabela de domínio carrega `cliente_id`. Acesso a dados sempre passa por filtro `cliente_id` no service layer **e** RLS no Postgres. Subdomínio (`<crm_tenant>.api.groner.app`) é o discriminador externo do tenant. Nunca confiar só em camada de aplicação.

### II. Visibilidade hierárquica + Mutação restrita ao owner
- **Roles (DB):**
  - `clientes` = **dono da loja** (1 admin principal por tenant). Coluna `is_superadmin boolean DEFAULT false` com CHECK `(is_superadmin=false OR lower(crm_tenant)='looper')`.
  - `clientes.vendedores` (jsonb array) = **vendedores/usuários da loja**. Cada item: `{id, nome, email, senha, telefone, role: 'owner'|'vendedor', is_active, recebe_agendamento, crm_id, ultimo_agendamento, horarios, created_at}`. Modelo decidido na reunião 2026-05-06; tabela `usuarios` antiga DROPADA em 2026-05-07. `horarios` e `created_at` agora são obrigatórios no shape canonical.
  - **`horarios: HorariosVendedor`** = `Partial<Record<DiaSemana, IntervaloHorario[]>>` com `DiaSemana ∈ {seg,ter,qua,qui,sex,sab,dom}` e `IntervaloHorario = {inicio: "HH:MM", fim: "HH:MM"}`. Presets: `PRESET_COMERCIAL_8_18` e `PRESET_COMERCIAL_8_19_SAB`.
  - **`id` do vendedor** é gerado via `Date.now() * 1000 + jitter` para evitar colisão em criação concorrente (jsonb não tem lock por item). Ver `nextVendedorId` em `mutations.ts`.
- **Roles (UI-facing):** `Admin` ↔ DB `role='owner'` ou row em `clientes`; `Usuário` ↔ DB `role='vendedor'`.
- **Sessão (`SessionPayload` — `kind, userId, clienteId, tenant, email, name`):**
  - `clientes.email/senha` → `kind=cliente`.
  - Vendedor com `role='owner'` em `clientes.vendedores` → `kind=cliente`.
  - Vendedor com `role='vendedor'` → `kind=usuario` (read-only).
  - **`isSuperadmin` NUNCA é embarcado no JWT** (removido em 2026-05-07). Lido fresh do DB via `isSuperadminFresh(session)` em `lib/auth/guard.ts` para que mudanças não dependam de re-login.
  - **JWT TTL = 7 dias** (não 30). Cookie `novosdr_session`, httpOnly, sameSite=lax.
- **Superadmin (Looper):** acesso global cross-tenant. Implementação do uso (rotas `/admin`, switch de tenant) é fase 2 — coluna existe em `clientes.is_superadmin`.
- **Menu Usuários é `adminOnly`** — vendedores não veem o item da sidebar (`components/sidebar.tsx`).
- **`clientes.lojas`** — jsonb array de unidades físicas. Schema canonical: `{nome, crm_id, area_atuacao, consumo_minimo, cnpj?, telefone?, endereco?, [extra: unknown]}`. Limites validados: `0 ≤ area_atuacao ≤ 500` km, `0 ≤ consumo_minimo ≤ 100000`. Campos extras só por superadmin via UI de pares chave/valor; **blocklist** rejeita `__proto__`, `prototype`, `constructor`. CRUD acontece em **`/lojas`** e no rodapé de `/perfil/cliente`. Vendedor não vê nem edita.
- **Leitura:**
  - `kind=cliente` (qualquer owner) → vê todos os `usuarios` e dados do tenant.
  - `kind=usuario` (vendedor) → vê apenas o que foi atribuído a ele (`leads.vendedor_id = userId`).
- **Escrita (mutação):**
  - **Apenas `kind=cliente`** pode criar/editar/desativar entidades (cliente, usuários, agentes, agendamentos, leads).
  - `kind=usuario` é read-only nesta fase.
  - Toda Server Action de mutação **deve** chamar `requireOwner(session)` em `src/lib/auth/guard.ts`. UI deve esconder botões via `isOwner(session)`.
- Super Admin (Groner): deferido — plano em [Plano — Super Admin (a criar)] ou doc Notion específico.

### III. Source of truth = banco
O que existe no Postgres `qtzowpbrduzkbyvrzscu` (Supabase) define o que a UI mostra. Briefings/specs descrevem aspirações; a UI só implementa o que tem suporte real no schema. Funcionalidades sem coluna/tabela ficam no Roadmap até modelagem.

### IV. Type-safety end-to-end
TypeScript estrito + Zod nas bordas + Drizzle ORM com tipos derivados do schema + tRPC entre client/server. Sem `any` implícito. Schema do banco é a fonte → tipos TS gerados a partir dele.

### V. Auth custom auditável
Login = `(crm_tenant, email, senha)`. **Hash bcrypt obrigatório** — desde 2026-05-07 `passwordMatches` rejeita qualquer credencial sem prefixo `$2*` (sem fallback de comparação direta). Sessão JWT (jose, HS256) em cookie httpOnly, TTL 7 dias. Sem dependência de Supabase Auth — modelo multi-tenant da Groner é por subdomínio, e essa decisão é estrutural.

**Login segregado por audiência (a partir de 2026-05-07):**
- `/login` — cliente comum (`kind=cliente` não-super, `kind=usuario`). Recusa superadmin.
- `/flows/login` — superadmin Groner. Recusa não-super sem criar sessão. Após login, redireciona pra `/flows`.
- Layout `(app)/flows/layout.tsx` é o gate do prefixo `/flows/*` — exige `isSuperadminFresh(session)`.

### VI. Service Layer obrigatório
Lógica de negócio mora em `src/server/services/<feature>.ts`, importada por Server Actions, tRPC procedures e cron jobs. Componentes de UI **nunca** consultam DB diretamente. Server Components podem chamar services; Client Components consomem via tRPC/Server Actions.

### VII. Tripé de documentação
Toda decisão estrutural ou mudança de schema é registrada em **três lugares**, sob pena de drift:
1. **`CONSTITUICAO.md`** — changelog cronológico + schema vivo + problemas/soluções + decisões.
2. **`TECH_STACK.md`** — decisões técnicas no formato `speckit.agent` (escolha + 💡 Motivo).
3. **`.specify/memory/constitution.md`** (este arquivo) — princípios estáveis que governam SpecKit.
Notion (página NOVO SDR) é a 4ª fonte para acompanhamento de produto/fixes — sempre referenciada, nunca contraditada.

## Stack Constraints

| Camada | Tecnologia | Status |
|---|---|---|
| Runtime | Node.js 20.9+ | obrigatório |
| Framework | **Next.js 16** (App Router, Turbopack default, `cookies()` async) | obrigatório |
| Linguagem | TypeScript 5+ estrito | obrigatório |
| UI | Tailwind v4 + shadcn/ui (Radix) — paleta `emerald` built-in; **dark mode único** | obrigatório |
| DB | PostgreSQL via Supabase (`qtzowpbrduzkbyvrzscu`, pooler `aws-1-us-east-1`) | obrigatório |
| ORM | Drizzle ORM + `postgres` (postgres-js) + drizzle-kit | obrigatório |
| Auth | Custom (subdomain + email + senha + bcrypt + JWT/jose) | obrigatório |
| Estado client | Zustand (UI state) + TanStack Query (server state) | obrigatório |
| API interna | tRPC | obrigatório |
| API externa (webhooks) | REST `/api/v1/...` com verificação de assinatura | obrigatório |
| Hospedagem | Vercel + Supabase | obrigatório |
| Workers | n8n self-hosted (`workflows.gronercrm.com.br`) | já existente |
| Observabilidade | Sentry + Vercel Analytics + PostHog | a configurar |
| Email transacional | Resend | a configurar |
| Pagamentos | Pagar.me (BR-first) | fase paga |
| LLM | Anthropic Claude (+ OpenAI fallback) | em uso via n8n |

## Estrutura de Repositório (Monorepo)

```
novo-sdr/
  apps/
    web/                       # Next.js 16
      src/
        app/
          (app)/               # route group autenticado (layout aplica AppShell + auth guard)
            layout.tsx
            dashboard/
            lojas/
            automacoes/
            leads/
            usuarios/
            agendamentos/
            prompts/
            perfil/
          login/               # rota pública
        components/             # UI components (Sidebar, AppShell, Header, etc.)
        lib/
          db/                  # Drizzle schema + client
          auth/                # session.ts, login.ts
          supabase/            # clients (reservados)
          cn.ts
        server/
          services/            # camada de negócio (DB queries, regras)
  ops/                         # scripts SQL, n8n exports — futuro
  CONSTITUICAO.md
  TECH_STACK.md
  .specify/                    # SpecKit memory + templates
```

## Convenções

### Assets / Mídia

- **Estáticos da Groner** (logo, favicons, OG, ilustrações padrão) → `apps/web/public/assets/{brand,illustrations,icons,og}/`. Servidos pelo Next direto na URL pública.
- **Importar via `next/image`** com `width`/`height` explícitos e `alt` descritivo. `priority` apenas em assets above-the-fold (logo da sidebar, hero do login).
- **Nomes em minúsculas com hífen** (`groner-logo.png`, `og-default.png`).
- **Conteúdo por tenant/usuário** (avatares, branding do cliente, mídias de WhatsApp, anexos) → **Supabase Storage** com bucket dedicado e URL assinada. Nunca em `public/`.
- Detalhes e exemplos: doc Notion `Organização de assets/mídia (Groner Flows)` (`3589084b98ef8111b390e32259c26f4d`).

### Geração de Fixes

- Bugs/melhorias devem ser registrados no DB Notion `[GESTAO] - Fixes` vinculados ao projeto NOVO SDR antes da implementação.
- Use o **system prompt** documentado em `Prompt do agente Notion para gerar Fixes (Groner Flows)` (`3589084b98ef8198898ad827546f2743`) para que o agente Notion gere Fixes no formato esperado (Descrição → Localização → Evidências → Esperado → Atual → Correção sugerida → Critérios de aceite).

### Demais convenções

- **Naming:** TS em `camelCase`; SQL em `snake_case`. Drizzle mapeia.
- **Status enum:** centralizado em `src/lib/enums.ts` (Postgres `CREATE TYPE` quando aplicável).
- **Datas:** `timestamptz` no banco, `Intl` na UI, fuso `America/Sao_Paulo`.
- **Idioma:** PT-BR único; arquitetura i18n-ready (`next-intl`) na fase 2.
- **Commits:** Conventional Commits.
- **Branches:** trunk-based; PR + 1 aprovação para merge em `main`.

### Tema (dark único)

- **Dark mode único.** Tema claro e paleta teal customizada foram tentados em 2026-05-06 e revertidos.
- **Token system em CSS vars** em `apps/web/src/app/globals.css`, registrado em `@theme inline` (Tailwind v4):
  - **Surfaces (ramp HSL ~157° S 30%):** `--ink-0 #04120d` < `--ink-1 #0a1f18` (body) < `--ink-2 #102b22` (sidebar / sub-cards) < `--ink-3 #15392d` (card padrão) < `--ink-4 #1d4a3b` (hover/active) < `--ink-5 #25604d` (elevated)
  - **Mint (brand):** `--mint-{50..900}` alinhada à logo. CTA usa 400→500. Acento ativo usa 300.
  - **Texto:** `--fg #ecf7f0`, `--fg-muted #a8c0b2`, `--fg-subtle #6e8479`, `--fg-disabled #4a5c53`
  - **Bordas (translúcidas em mint):** `--b-soft 0.08`, `--b-base 0.14`, `--b-strong 0.26`, `--b-bright 0.42`
  - **Anel/shadows:** `--ring`, `--glow-{sm,md,lg}` (combinam shadow preto + glow mint baixo)
  - **Logo (`#46c89a`) é o teto** — nenhuma surface chega lá.
- Em código novo, **usar variáveis** (`bg-[color:var(--ink-3)]`, `text-[color:var(--fg)]`, `border-[color:var(--b-soft)]`) ou as **classes utilitárias** (`.surface`, `.surface-flat`, `.kpi-card`, `.btn-primary`, `.btn-ghost`, `.input`, `.chip*`, `.label-eyebrow`, `.numerics`, `.serif`, `.table-editorial`). **Nada de** hex hardcoded ou `emerald-*` Tailwind direto.
- Texto: `text-zinc-100` (fg), `text-zinc-400` (muted), `text-zinc-500` (subtle), acentos `text-emerald-400`/`text-emerald-300`.
- Acentos primários: `bg-emerald-500` / `hover:bg-emerald-400` para CTAs; `bg-emerald-500/10` para chips/pílulas.
- Componentes novos devem reusar essas classes diretamente. Nada de `dark:` variants nem custom palette.

### Tipografia (Editorial Trading Terminal)

- **Headings (h1, modal titles, valores destacados, "Flows" wordmark):** `Instrument Serif` (Google Fonts), classe `.serif`. Variant italic para acentos brand.
- **Body / UI:** Geist Sans (default).
- **Numerics, datas, IDs, código inline:** Geist Mono via classe `.numerics` com `font-variant-numeric: tabular-nums`.
- **Eyebrow labels** (acima de h2/cards): `.label-eyebrow` — 10.5px, 0.14em tracking, uppercase.

### Atmosfera + Motion

- Body com radial-gradient mint baixo (top-left + bottom-right) + SVG noise overlay 4% para textura.
- Entradas usam keyframes definidos: `lift-in`, `fade-in`, `scale-in`. Listas com `.stagger` para delay incremental 40ms.
- Hover de cards usa `transform: translateY(-1px)` + border mais forte. Active de sidebar usa accent-line 2px com glow.

### Visibilidade de campos sensíveis

- **Tokens** (`api_token`, `crm_token`, `senha`) **nunca** aparecem na UI para roles que não são superadmin/owner-do-próprio-recurso. Hoje a regra é hardcoded em `/perfil/cliente`: `cliente.is_superadmin === true` controla render dos inputs `apiToken` e `crmToken`.
- Uma futura iteração permitirá superadmin **marcar via UI** quais campos aparecem para o cliente comum (flags por coluna). Trabalho deferido.
- Na ausência de flag explícita: tokens hidden, demais campos de configuração visíveis ao admin do tenant.

### Integração com CRM externo (Groner CRM)

- **Endpoints CRM utilizados** (todos em `https://<crm_tenant>.api.groner.app/api/...` com `Authorization: Bearer <clientes.crm_token>`):
  - `GET /conta/minhaConta` — validação. Retorna `Content.tenant.identifier`, `Content.tenant.name`, `Content.loja.nome`, `Content.nome`, `Content.email`. Server Action `validateCrmConnectionAction` em `app/(app)/perfil/cliente/actions.ts`. Confere `tenant.identifier === clientes.crm_tenant` para garantir token correto. UI mostra badge no topo da seção Funis CRM: verde (ok), amarelo (tenant não bate), vermelho (erro/401).
  - `GET /statusProjeto/agrupadoPorEtapa` — listar colunas do CRM. Server Action `fetchCrmFunisAction`. Usado pelo picker em `crm-status-slots.tsx`.
  - `GET /usuario?pageNumber=1&pageSize=200&somenteAtivos=true` — listar funcionários ativos. Server Action `fetchCrmUsuariosAction`. Usado pelo picker em `/usuarios/novo` para autopreenchimento de nome/email/celular/crmId.
- Endpoint padrão para listar status agrupados por etapa: `GET https://<tenant>.api.groner.app/api/statusProjeto/agrupadoPorEtapa` com `Authorization: Bearer <clientes.crm_token>`.
- Server Action `fetchCrmFunisAction` (em `apps/web/src/app/(app)/perfil/cliente/actions.ts`) é o caminho canônico. Não chamar do client diretamente.
- Resposta normalizada para `{id, nome, etapaId, etapaNome}[]`. Cliente UI agrupa por etapa.
- IDs + nomes salvos em **uma única coluna unificada** `clientes.crm_status_colunas` (jsonb array). As 3 colunas antigas (`crm_status_incial`, `crm_status_qualificado`, `crm_status_desqualificado`) foram **dropadas** em 2026-05-06.
  - Schema do array: `[{nome, id, slug, tipo}, ...]` com 9 slots fixos.
  - `tipo ∈ {inicial, qualificacao, desqualificacao}` classifica a coluna.
  - Slugs estáveis definidos em `apps/web/src/lib/crm/slots.ts`: `inicial`, `qualificado`, `area_atuacao`, `sem_resposta`, `sem_remarketing`, `consumo_insuficiente`, `fechou_c_concorrente`, `desqualificacao_geral`, `desqualificacao_outros`.
  - **Slug é imutável** — usado pelo backend/n8n como chave estável. Cliente edita só `id` (do CRM) e `nome` (label visual). `tipo` também é imutável.
  - **Ordem canônica das chaves** em todo objeto: `nome` → `id` → `slug` → `tipo`. Tipo `CrmStatusSlot` declarado nessa ordem; helpers `normalizeSlot` / `normalizeSlotList` em `lib/crm/slots.ts` reconstroem na ordem ao ler do banco (Postgres jsonb não preserva order interno).
  - Helpers extras: `findByTipo(list, tipo)`, `findBySlug(list, slug)`, `filterDesqualificacao(list)`.
- UI: componente `CrmStatusSlots` recebe `colunas: CrmStatusSlot[] | null` (1 prop) e agrupa visualmente em 3 seções (Start Inicial / Qualificação / Desqualificação). Helper colapsável "Buscar do CRM" usa `fetchCrmFunisAction` para autopreencher slots.

### Toggles inline (Switch)

- Para campos boolean editáveis em listas/cards (ex.: `is_active`, `recebe_agendamento`), use o componente `<Switch>` em `apps/web/src/components/switch.tsx`. Padrão visual: pill 36×20, knob 14×14, mint quando ligado, ink quando desligado.
- `<Switch>` recebe `id`, `checked`, `action` (Server Action que aceita `FormData` com `id` + `next`) e `label` (acessibilidade).
- Toda Server Action de toggle deve chamar `requireOwner(session)` antes de mutar e fazer `revalidatePath` das rotas afetadas.
- Vendedor (`kind=usuario`) **nunca** vê o Switch — vê chip texto read-only ("ativo"/"inativo", "sim"/"não").
- Implementação usa optimistic UI via `useTransition` + rollback em erro.

### View Switcher (cards ↔ tabela)

- Listas de entidades podem oferecer modos `card` e `table` controlados por `?view=` na URL (compartilhável). Default = card.
- Aplicado em `/automacoes`. Pode ser estendido a outras listas conforme necessidade.

### UX — Busca e Modais

- **Busca global por página:** input debounced (200ms) em `SearchBox` que escreve `?q=` na URL via `router.replace` + `useTransition`. Service da página recebe `q` e aplica `ILIKE` nas colunas de texto. URLs com busca devem ser compartilháveis.
- **Modais de detalhe:** componente `DetailModal` ocupa **80% da tela** (`max-w-[80vw]`, `max-h-[85vh]`), fecha com Esc ou click no backdrop. Estado controlado por query param `?detail=<id>` para permitir compartilhamento de link e back/forward do navegador. Header com título + subtítulo + botão fechar; footer com **ação destacada** (botão "Editar" só visível se `isOwner(session)`). Não usar modais para fluxos longos — esses ficam em página dedicada.
- **Filtros adicionais:** quando aplicável (ex.: agendamentos), expor filtros como query params adicionais (`?from=`, `?to=`, `?scope=`) preservados ao navegar/buscar.

### Mutations — Defesas obrigatórias

- **Toda mutation que aceita objeto vindo de FormData** (campos extras de loja, etc) deve passar por blocklist de chaves removendo `__proto__`, `prototype`, `constructor` antes de mesclar (Object.assign / spread).
- **Datas** vindas de `new Date(input)` devem ser validadas (`isNaN(d.getTime())`) antes de salvar — `updateAgendamento` é referência.
- **IDs concorrentes em arrays jsonb:** usar `Date.now() * 1000 + Math.floor(Math.random() * 1000)` (não `max+1`) para evitar colisão em escritas simultâneas.
- **Race condition jsonb:** `clientes.lojas` e `clientes.vendedores` usam read-modify-write sem lock. Mutations devem ser idempotentes/retryable e mergear por `crm_id` ou `id` quando possível. Migração para transação com lock está em fixes pendentes (Notion).
- **`createX` em `mutations.ts` lista TODAS as colunas/keys do tipo no insert**, mesmo com `null`/`[]`/`{}`/`""` — shape canonical desde criação. Convenção documentada no topo do `mutations.ts`.

### Variáveis de ambiente

- `SESSION_SECRET` — 32+ chars, JWT HS256.
- `GRONER_ZAP_DEV_TOKEN` — autoriza listar instâncias WhatsApp.
- `GRONER_INSTANCES_URL` — endpoint AWS de instâncias WhatsApp (default in-code, overridável).

### VIII. Validação obrigatória em alterações (não-negociável)

Toda mudança de código segue o ciclo:

1. **Pré-validação** — mapear quem depende do que vai ser alterado: callsites, tipos compartilhados, fluxos paralelos, papéis de usuário (super/admin/vendedor) afetados.
2. **Pós-edição** — depois de aplicar, rodar `tsc --noEmit` no `apps/web` e grep pelos símbolos alterados. Adaptar callsites quebrados na mesma rodada.
3. **Teste** — validar comportamento (browser/curl/lint). Sem validação confirmada, não entregar como "feito". Ao remover/esconder UI, garantir caminho equivalente acessível.

Aplica especialmente quando: mexer em sidebar / route group / layout / mutations / schema. Cada papel (super, admin, vendedor) precisa continuar com acesso ao que precisa.

## Quality Gates

Toda feature deve, antes de merge:
1. Passar `npm run lint` e `npm run typecheck`.
2. Ter testes E2E (Playwright) cobrindo o caminho feliz se for fluxo crítico.
3. Respeitar visibilidade multi-tenant — verificada em service tests com mocks de session por `kind`.
4. Atualizar **os 3 docs** (CONSTITUICAO, TECH_STACK, este arquivo) quando alterar algo estrutural ou schema.
5. **Performance:** se a feature toca DB ou faz queries em hot path, **rodar com pool aquecido** e usar `Promise.all` quando as queries forem independentes. Toda nova rota crítica deve medir TTFB e LCP antes de merge.

## Princípios de Performance

- **DB queries paralelas por padrão.** Sequencial só com dependência de dados real entre queries. Use `Promise.all`. Lição aprendida 2026-05-06: 10 queries sequenciais @ 130ms RTT = 1.3s; com `Promise.all` em pool quente = 143ms.
- **Pool de DB aquece no boot** via `apps/web/src/instrumentation.ts` (`register()` chamando `await sql\`SELECT 1\``). Implementado em 2026-05-06 — sem isso, primeira request pós-boot pagaria 1.3s de handshake TLS+auth. **Não remover este arquivo.**
- **Sempre medir com pool quente** — pool frio mascara paralelização (cada conexão simultânea paga handshake).
- **Animation delays ≤ 120ms total**, e nunca usar `opacity: 0` inicial em conteúdo critical-path (afeta LCP métrica oficial). `transform` sozinho é seguro.
- **Efeitos de paint atmosféricos** (radial-gradients, SVG noise, `mix-blend-mode`, `backdrop-filter`) podem entrar mas com `@media (prefers-reduced-motion: reduce)` desligando-os e considerar GPU fraca como caso de teste.
- **`next.config.ts` deve listar:** `serverExternalPackages: ['postgres']` (drivers nativos), `optimizePackageImports: ['lucide-react']` (icon trees).
- **`readSession` em RSC** deve usar `cache()` do React quando layout + page do mesmo segmento o consomem.
- **Issues conhecidos** vivem em `TECH_STACK.md` seção "Performance — issues conhecidos" com status e impacto medido.

## Out of Scope (deferido para fase 2)

- Marketplace/contratação de automações + créditos.
- Audit log / atividades da IA.
- Health check de integrações.
- Multi-loja por cliente.
- Admin de loja (role intermediário entre cliente e usuário).
- "Último acesso" do usuário.
- Tempo do lead em atendimento (precisa de coluna `assumed_at`).
- Modal de teste de prompt + persona + agente juiz.
- Pagamentos / faturamento.
- Notificações push + WhatsApp marketing.

Itens entram no escopo somente quando o schema ganhar suporte (ver Princípio III).

## Governance

- Esta constituição **supera** preferências individuais e suposições do agente.
- Mudanças exigem PR + atualização sincronizada nos 3 docs (Princípio VII).
- Justificativa obrigatória para qualquer desvio das Stack Constraints.
- Novas tabelas/colunas devem aparecer em `CONSTITUICAO.md` no mesmo PR que as cria.

**Version:** 1.2.0 | **Ratified:** 2026-05-06 | **Last Amended:** 2026-05-07

### Amendments 1.2.0 (2026-05-07)

- Login segregado: `/flows/login` exclusivo pra superadmin; `/login` recusa super.
- Sidebar consolidada pra superadmin: `Lojas`, `Usuários` e `Configurações` escondidos (acesso unificado pelo modal de Clientes em `/perfil/cliente`). Item `Clientes` adicionado.
- Flag `hideForSuper` no tipo de item da sidebar pra suportar visibilidade diferenciada.
- Princípio: tabela `clientes` é o hub canonical — Lojas (jsonb), Vendedores (jsonb) e Status do CRM (jsonb) são todas extensões do mesmo registro. UI reflete isso com tabs no modal em vez de telas separadas (ao menos pra superadmin).

### Amendments 1.1.0 (2026-05-07)

- DROP TABLE `usuarios` (definitivo). Vendedores vivem exclusivamente em `clientes.vendedores` (jsonb).
- `Vendedor` ganha `horarios` e `created_at` obrigatórios no shape canonical.
- `Loja` ganha `cnpj?`, `telefone?`, `endereco?` como campos nomeados (antes só `[extra: unknown]`).
- `createCliente` seta `crmStatusColunas: []` na criação (shape canonical).
- Limites validados em loja: `area_atuacao ∈ [0, 500]` km, `consumo_minimo ∈ [0, 100000]`.
- `isSuperadmin` removido do JWT — sempre lido fresh do DB.
- Menu Usuários agora é `adminOnly`.
- Blocklist `__proto__`/`prototype`/`constructor` em mutations que aceitam FormData extras.
- `updateAgendamento` valida Date antes do insert.
- `nextVendedorId` via timestamp (não `max+1`).
- `GRONER_INSTANCES_URL` env var (substitui hardcode AWS).
- Senha bcrypt obrigatória — fallback de comparação direta removido.
- React 19 patterns: `useSyncExternalStore` em DebugProvider; derived state em SearchBox.
- JWT TTL ajustado pra 7 dias (TECH_STACK ainda dizia 30 — corrigido).

## Sessão 2026-05-08 — Padrão de tabelas editoriais + multi-loja em vendedores

- **Padrão unificado de tabelas editoriais** aplicado em `/clientes`, `/lojas`, `/usuarios`. Single-line travado, edit inline expansível, drag/drop reorder, ColumnPicker, paginação 10/20/50/100, coluna virtual Saúde + Validação JSON super-only, indicador `ⓘ` amarelo em vazios.
- **Componentes shared** em `apps/web/src/components/data-table/`: BooleanToggle, CopyButton, SecretActions, SecretInput, ColumnPicker<K>, TablePagination, JsonValidationModal, SearchableSelect<T,K>, ícones inline SVG. PasswordConfirm em `components/`.
- **`Loja.id: string` (uuid)** adicionado no jsonb (sem alterar SQL). 25 lojas em 18 clientes backfilled.
- **`Vendedor.uid: string` (uuid) + `Vendedor.loja_ids: string[]`** adicionados no jsonb. 57 vendedores em 18 clientes backfilled. Vendedor pode atender múltiplas lojas.
- **Backfill workflow**: schema TS first → emptyX/pickCanonicalX → script idempotente (dry-run + apply) → verify idempotência. Scripts em `apps/web/scripts/backfill-{loja,vendedor}-ids.ts`. Autorização explícita do usuário obrigatória pra cada mudança de shape.
- **SearchableSelect padrão** pra qualquer seleção de entidade — nunca `<select>` nativo. Memória feedback registrada.
- **Privilege escalation gate** em `is_superadmin`: criar/ativar/desativar exige senha do super atuante via `verifySuperPasswordAction` + `PasswordConfirm`. Aplicado em toggle da tabela, checkbox do modal de edição e checkbox do modal de criação.
- **Auto-fetch on mount + erros visíveis** padrão em status remotos (ex: WhatsApp em /clientes). Tooltip detalhado com erro real, click pra retentar. Erro silencioso é antipattern.
- **Coluna virtual Status WA** super-only em `/clientes` com auto-fetch sequencial.
- **Modal de edição de loja em 3 abas** (Informações / Endereço / Configuração e agenda).
- **Modal de edição de usuário em 2 abas** (Informações com acesso integrado / Horários com `UsuarioHorariosGrid` controlled).
- **Sidebar reordenada**: super (Flows → Clientes → Lojas → Cadastro → Dashboard → resto), cliente comum (Clientes → Lojas → Dashboard → Usuários → Configurações). `/clientes` mudou pra `adminOnly` (cliente comum também vê).
- **Notion task tracking** via MCP padronizado: `notion-fetch` no project page → pega `data_source_id` → `notion-create-pages` com properties (Status, Prioridade, Projetos como JSON-array de URL). Database `[GESTAO] - Tarefas`.
- **Tarefa Notion criada** (P3, Backlog): "Reset de senha de usuário → enviar via WhatsApp" pra evolução futura da importação de usuários do CRM.
