-- Refatoração: automacoes vira catálogo, clientes_automacoes guarda instâncias.
-- Banco vazio confirmado (0 rows em automacoes), DROP+CREATE seguro.

BEGIN;

DROP TABLE IF EXISTS automacoes CASCADE;

CREATE TABLE automacoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome TEXT NOT NULL,
  descricao TEXT,
  base_url TEXT,
  n8n_workflow_id TEXT,
  versao TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  dados_configuracoes_template JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT automacoes_nome_versao_unique UNIQUE (nome, versao)
);

CREATE INDEX automacoes_is_active_idx ON automacoes (is_active);

CREATE TABLE clientes_automacoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  automacao_id BIGINT NOT NULL
    REFERENCES automacoes(id) ON DELETE RESTRICT,
  cliente_id BIGINT NOT NULL
    REFERENCES clientes(id) ON DELETE CASCADE,
  loja_id TEXT NOT NULL,
  dados_configuracoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT clientes_automacoes_unique
    UNIQUE (cliente_id, automacao_id, loja_id)
);

CREATE INDEX clientes_automacoes_cliente_idx
  ON clientes_automacoes (cliente_id);
CREATE INDEX clientes_automacoes_cliente_loja_idx
  ON clientes_automacoes (cliente_id, loja_id);
CREATE INDEX clientes_automacoes_automacao_idx
  ON clientes_automacoes (automacao_id);

COMMIT;
