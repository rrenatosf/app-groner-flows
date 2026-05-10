-- Add formal FK constraint: automacoes.cliente_id → clientes.id
-- ON DELETE CASCADE: deletar cliente apaga todas suas automações.
--
-- Pré-requisito: zero órfãos. Validar com:
--   SELECT a.id, a.cliente_id
--   FROM automacoes a
--   LEFT JOIN clientes c ON c.id = a.cliente_id
--   WHERE c.id IS NULL;
--
-- Se a query acima retornar linhas, ABORTE o ALTER e limpe órfãos
-- antes (delete ou reaponte). Caso contrário o ALTER falha com
-- "violates foreign key constraint".

BEGIN;

ALTER TABLE automacoes
  ADD CONSTRAINT automacoes_cliente_id_fkey
  FOREIGN KEY (cliente_id)
  REFERENCES clientes(id)
  ON DELETE CASCADE;

COMMIT;

-- Rollback (se precisar reverter):
--   ALTER TABLE automacoes DROP CONSTRAINT automacoes_cliente_id_fkey;
