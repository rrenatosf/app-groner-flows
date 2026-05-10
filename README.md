# Groner Flows

Plataforma multi-tenant para gerenciamento de SDRs IA da Groner.

## Stack

- Next.js 16 (Turbopack) · React 19 · TypeScript strict
- Tailwind v4 (`@theme inline`)
- Drizzle ORM + postgres-js
- Supabase Postgres (pooler `aws-1-us-east-1.pooler.supabase.com`)
- JWT custom (`jose`) + bcryptjs
- n8n workflows em `workflows.gronercrm.com.br`

## Setup local

```bash
cd apps/web
cp .env.example .env.local   # preencher com secrets reais
npm install
npm run dev
```

App em `http://localhost:3000`.

## Documentação

- `CONSTITUICAO.md` — schema, regras de negócio, decisões de arquitetura.
- `TECH_STACK.md` — stack técnica + status de implementação.
- `.specify/memory/constitution.md` — versão SpecKit.

Tripé deve estar sempre sincronizado.

## Deploy

Ver tarefa **"Deploy na Vercel — estudo de preços e procedimento"** no Notion.
