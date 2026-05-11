/**
 * One-off: adiciona coluna `prompt` em automacoes e cliente_automacoes.
 * Idempotente (IF NOT EXISTS).
 *
 *   cd apps/web
 *   node --env-file=.env.local --experimental-strip-types scripts/add-prompt-columns.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  console.log("=== ALTER automacoes ADD prompt ===");
  await sql`
    ALTER TABLE automacoes
      ADD COLUMN IF NOT EXISTS prompt text
  `;
  await sql`
    COMMENT ON COLUMN automacoes.prompt IS
      'Prompt da automação quando ela é um agente de IA. NULL/empty quando automação não é IA.'
  `;

  console.log("=== ALTER cliente_automacoes ADD prompt ===");
  await sql`
    ALTER TABLE cliente_automacoes
      ADD COLUMN IF NOT EXISTS prompt text
  `;
  await sql`
    COMMENT ON COLUMN cliente_automacoes.prompt IS
      'Prompt da instância (cópia do template do catálogo, editável por instância).'
  `;

  console.log("\n=== verify ===");
  const cols = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('automacoes', 'cliente_automacoes')
      AND column_name = 'prompt'
    ORDER BY table_name
  `;
  console.log(JSON.stringify(cols, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 1 }));
