-- ============================================================
-- Migration: create table `automacoes`
-- Date: 2026-05-09
-- ============================================================
--
-- Cria a tabela `automacoes` — registro canônico de automações
-- (workflows n8n) por cliente/loja. Substitui o uso anterior da
-- rota /automacoes que era apenas um alias visual da tabela
-- `agentes`. Doc de design: docs/TABELAS.md.
--
-- Convenções:
--   - `id` BIGINT GENERATED ALWAYS AS IDENTITY (drizzle: $generatedAlwaysAsIdentity)
--   - `cliente_id` BIGINT — FK lógica para `clientes.id` (sem
--     constraint formal — pattern do projeto)
--   - `loja_id` TEXT — UUID da loja em `clientes.lojas` (jsonb)
--   - `dados_configuracoes` JSONB — array de objetos com 1 chave
--     cada (nome do grupo) cujo valor é outro objeto (config
--     arbitrária do grupo). Validação de shape no app.
--
-- Nenhuma constraint de FK é criada: lojas vivem em jsonb.
-- Integridade é responsabilidade do app (server actions).
-- ============================================================

CREATE TABLE automacoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cliente_id BIGINT NOT NULL,
  loja_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  base_url TEXT,
  n8n_workflow_id TEXT,
  versao TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  dados_configuracoes JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Índices para os filtros mais comuns (drilldowns por cliente/loja).
CREATE INDEX automacoes_cliente_id_idx ON automacoes (cliente_id);
CREATE INDEX automacoes_loja_id_idx ON automacoes (loja_id);

-- ============================================================
-- Comments (documentação no schema do Postgres — útil pra DBAs
-- e ferramentas de inspeção)
-- ============================================================
COMMENT ON TABLE automacoes IS
  'Automações (workflows n8n) cadastradas por cliente/loja. Cada linha representa uma instância de automação rodando para um tenant + loja específicos. dados_configuracoes guarda configs arbitrárias agrupadas em blocos.';

COMMENT ON COLUMN automacoes.id IS
  'PK numérica auto-incremento (BIGINT GENERATED ALWAYS AS IDENTITY).';

COMMENT ON COLUMN automacoes.created_at IS
  'Timestamp de criação (UTC, com timezone). Default NOW().';

COMMENT ON COLUMN automacoes.cliente_id IS
  'FK lógica para clientes.id. Tenant dono da automação. Sem constraint formal — pattern do projeto (mesmo de agentes).';

COMMENT ON COLUMN automacoes.loja_id IS
  'UUID da loja (clientes.lojas[*].id) que essa automação atende. Não é FK formal porque lojas vivem em jsonb. App valida integridade ao criar/editar.';

COMMENT ON COLUMN automacoes.nome IS
  'Nome legível da automação (obrigatório, NOT NULL).';

COMMENT ON COLUMN automacoes.descricao IS
  'Descrição livre opcional. Texto plain.';

COMMENT ON COLUMN automacoes.base_url IS
  'Base URL do n8n da automação (ex: https://n8n.dominio.com). Combinado com n8n_workflow_id forma o link direto pro workflow.';

COMMENT ON COLUMN automacoes.n8n_workflow_id IS
  'ID do workflow n8n (slug alfanumérico). Vinculação com a instância n8n. App valida formato [A-Za-z0-9]{8,}.';

COMMENT ON COLUMN automacoes.versao IS
  'Versão semântica ou identificador interno da automação (ex: 1.0.3, sdr-v2). Texto livre.';

COMMENT ON COLUMN automacoes.is_active IS
  'Flag de ativo/desativado. Default TRUE. Inativo não é deletado — mantido para histórico.';

COMMENT ON COLUMN automacoes.dados_configuracoes IS
  'Configurações dinâmicas — array JSON onde cada item é um objeto com EXATAMENTE 1 chave (nome do grupo) cujo valor é outro objeto (config arbitrária do grupo). Default array vazio. Shape validado no app antes do save.';
