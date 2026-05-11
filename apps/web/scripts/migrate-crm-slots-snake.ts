/**
 * Migration: padroniza shape de slots em `clientes.crm_status_colunas`.
 *
 *  - Rename `notUsed` (camel) → `not_used` (snake) — preserva valor.
 *  - Garante `not_used: false` em slots sem o campo.
 *  - Garante `etapa_id: ""` em slots sem o campo.
 *  - Garante `etapa_nome: ""` em slots sem o campo.
 *
 * Idempotente: rodar de novo é no-op.
 *
 *   cd apps/web
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-crm-slots-snake.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

type Slot = Record<string, unknown>;

function normalizeSlot(s: Slot): { slot: Slot; changed: boolean } {
  const out: Slot = { ...s };
  let changed = false;
  if ("notUsed" in out) {
    out.not_used = out.notUsed;
    delete out.notUsed;
    changed = true;
  }
  if (!("not_used" in out)) {
    out.not_used = false;
    changed = true;
  }
  if (!("etapa_id" in out)) {
    out.etapa_id = "";
    changed = true;
  }
  if (!("etapa_nome" in out)) {
    out.etapa_nome = "";
    changed = true;
  }
  return { slot: out, changed };
}

async function main() {
  const rows = await sql<{ id: number; crm_status_colunas: Slot[] | null }[]>`
    SELECT id, crm_status_colunas
    FROM clientes
    WHERE crm_status_colunas IS NOT NULL
      AND jsonb_typeof(crm_status_colunas) = 'array'
  `;

  let updated = 0;
  let totalSlots = 0;
  let slotsChanged = 0;
  for (const r of rows) {
    const arr = Array.isArray(r.crm_status_colunas)
      ? r.crm_status_colunas
      : [];
    if (arr.length === 0) continue;
    totalSlots += arr.length;
    const nextArr: Slot[] = [];
    let anyChanged = false;
    for (const s of arr) {
      const r2 = normalizeSlot(s);
      if (r2.changed) {
        anyChanged = true;
        slotsChanged++;
      }
      nextArr.push(r2.slot);
    }
    if (anyChanged) {
      await sql`
        UPDATE clientes
        SET crm_status_colunas = ${JSON.stringify(nextArr)}::jsonb
        WHERE id = ${r.id}
      `;
      updated++;
    }
  }

  console.log(`clientes processados: ${rows.length}`);
  console.log(`clientes atualizados: ${updated}`);
  console.log(`slots totais: ${totalSlots}`);
  console.log(`slots modificados: ${slotsChanged}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 1 }));
