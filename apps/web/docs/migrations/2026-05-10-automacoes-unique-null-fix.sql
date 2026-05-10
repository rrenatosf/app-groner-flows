-- Fix UNIQUE (nome, versao) em `automacoes`: Postgres trata NULL ≠ NULL
-- por padrão, então 2 catalogos com versao=NULL passavam. NULLS NOT
-- DISTINCT força tratamento NULL = NULL, bloqueando duplicatas reais.
-- Requer Postgres 15+.

BEGIN;

ALTER TABLE automacoes
  DROP CONSTRAINT automacoes_nome_versao_unique;

ALTER TABLE automacoes
  ADD CONSTRAINT automacoes_nome_versao_unique
  UNIQUE NULLS NOT DISTINCT (nome, versao);

COMMIT;
