/**
 * Helpers de parse defensivos pra respostas Uazapi.
 *
 * Por que existir: o backend Uazapi (Go) viola a própria spec OpenAPI em
 * casos de coleção vazia — `json.Marshal(nil slice)` serializa como `null`
 * literal em vez de `[]`. Sem guard, qualquer `(raw as {...}).campo`
 * quebra com `Cannot read properties of null`.
 *
 * Doc: https://docs.uazapi.com/openapi-bundled.json
 */

/** Type guard pra "raw é um object plain (não null, não array)". */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extrai array de uma resposta Uazapi com tolerância a:
 *  - array direto (caso ideal: `[...]`)
 *  - null literal (Go marshalling de nil slice — caso real)
 *  - wrapper objeto: `{ webhooks: [...] }`, `{ data: [...] }` etc.
 *  - qualquer primitivo / shape inesperado → []
 */
export function parseUazapiList(
  raw: unknown,
  keys: ReadonlyArray<string> = [],
): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const k of keys) {
    const v = raw[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

