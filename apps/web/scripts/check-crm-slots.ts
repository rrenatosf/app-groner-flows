/**
 * Diagnostic: inspeciona shape real de `clientes.crm_status_colunas`.
 *
 *   cd apps/web
 *   node --env-file=.env.local --experimental-strip-types scripts/check-crm-slots.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  console.log("=== shape agregado: quais keys aparecem nos slots? ===");
  const keysAgg = await sql`
    SELECT
      key,
      COUNT(*) AS occurrences
    FROM clientes,
         jsonb_array_elements(COALESCE(crm_status_colunas, '[]'::jsonb)) slot,
         jsonb_object_keys(slot) key
    GROUP BY key
    ORDER BY occurrences DESC
  `;
  console.log(JSON.stringify(keysAgg, null, 2));

  console.log("\n=== amostra: 5 primeiros clientes com slots ===");
  const sample = await sql`
    SELECT
      id,
      nome,
      jsonb_array_length(COALESCE(crm_status_colunas, '[]'::jsonb)) AS qtd_slots,
      crm_status_colunas
    FROM clientes
    WHERE crm_status_colunas IS NOT NULL
      AND jsonb_array_length(crm_status_colunas) > 0
    ORDER BY id
    LIMIT 5
  `;
  for (const r of sample) {
    console.log(`\n--- cliente ${r.id} (${r.nome}) — ${r.qtd_slots} slots`);
    console.log(JSON.stringify(r.crm_status_colunas, null, 2));
  }

  console.log("\n=== quantos clientes têm slots com etapa_id presente? ===");
  const etapaStats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE slot ? 'etapa_id') AS com_etapa_id,
      COUNT(*) FILTER (WHERE slot ? 'etapa_nome') AS com_etapa_nome,
      COUNT(*) FILTER (WHERE slot ? 'etapaId') AS com_etapaId_camel,
      COUNT(*) FILTER (WHERE slot ? 'notUsed') AS com_not_used,
      COUNT(*) AS total_slots
    FROM clientes,
         jsonb_array_elements(COALESCE(crm_status_colunas, '[]'::jsonb)) slot
  `;
  console.log(JSON.stringify(etapaStats, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 1 }));
