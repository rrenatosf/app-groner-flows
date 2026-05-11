/**
 * Diagnostic: verifica se `dados_comentarios` foi adicionada em
 * `automacoes` e mostra o JSON atual de cada linha.
 *
 * Uso (não persiste nada):
 *   cd apps/web
 *   node --env-file=.env.local --experimental-strip-types scripts/check-comentarios.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  console.log("=== check 1: coluna existe? ===");
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'automacoes'
      AND column_name IN ('dados_configuracoes_template', 'dados_comentarios')
    ORDER BY column_name
  `;
  console.log(JSON.stringify(cols, null, 2));

  console.log("\n=== check 2: linhas + JSONs ===");
  const rows = await sql`
    SELECT
      id,
      nome,
      versao,
      pg_typeof(dados_comentarios)::text AS comentarios_type,
      dados_comentarios,
      jsonb_pretty(dados_comentarios) AS comentarios_pretty,
      array_length(array(SELECT jsonb_object_keys(dados_comentarios)), 1) AS comentarios_count,
      jsonb_pretty(dados_configuracoes_template) AS template_pretty
    FROM automacoes
    ORDER BY id
  `;
  for (const r of rows) {
    console.log("---");
    console.log(`id=${r.id} nome=${r.nome} versao=${r.versao}`);
    console.log(`comentarios_type: ${r.comentarios_type}`);
    console.log(`comentarios_count: ${r.comentarios_count}`);
    console.log(`comentarios:\n${r.comentarios_pretty}`);
    console.log(`template:\n${r.template_pretty}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 1 }));
