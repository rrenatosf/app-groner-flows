// Helpers de coluna server-safe (sem "use client") — usados em page.tsx server components.

export type ColumnDef = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "date";
  align: "left" | "right";
};

export function resolveVisibleCols(
  raw: string | undefined,
  allColumns: ColumnDef[],
  defaultKeys: string[],
): string[] {
  if (raw === "__none__") return [];
  const keys = raw
    ? raw.split(",").filter((k) => allColumns.some((c) => c.key === k))
    : defaultKeys;
  return keys.length > 0 ? keys : defaultKeys;
}
