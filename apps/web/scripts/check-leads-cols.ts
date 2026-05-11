/**
 * Diagnostic: lista colunas da tabela `leads`. Foco nas novas:
 * `dados_completos` e `cliente_automacao_id`.
 *
 *   cd apps/web
 *   node --env-file=.env.local --experimental-strip-types scripts/check-leads-cols.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  console.log("=== colunas da tabela `leads` ===");
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'leads'
    ORDER BY ordinal_position
  `;
  console.log(JSON.stringify(cols, null, 2));

  console.log("\n=== FKs da tabela `leads` ===");
  const fks = await sql`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'leads'
  `;
  console.log(JSON.stringify(fks, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 1 }));
