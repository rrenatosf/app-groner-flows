import { pendenciasFor } from "../../saude";
import type { ClienteRow } from "../../clientes-table";

/**
 * Banner de pendências do cliente — extraído do bloco do
 * cliente-edit-modal (linhas 528-553). Server component puro;
 * só renderiza marcação se houver pendências.
 */
export function PendenciasBanner({
  cliente,
  isSuper,
}: {
  cliente: ClienteRow;
  isSuper: boolean;
}) {
  const pendencias = pendenciasFor(cliente, { isSuper });
  if (pendencias.length === 0) return null;

  return (
    <div
      className="mx-7 mt-4 px-3 py-2 rounded-md text-[12px] flex items-center gap-2 flex-wrap"
      style={{
        backgroundColor: "var(--rose-bg)",
        color: "var(--rose-300)",
        border: "1px solid var(--rose-border)",
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{
          backgroundColor: "var(--rose-300)",
        }}
      />
      <strong className="font-medium">
        {pendencias.length} pendência{pendencias.length === 1 ? "" : "s"}:
      </strong>
      <span className="opacity-90">
        {pendencias.map((p) => p.label).join(", ")}
      </span>
    </div>
  );
}
