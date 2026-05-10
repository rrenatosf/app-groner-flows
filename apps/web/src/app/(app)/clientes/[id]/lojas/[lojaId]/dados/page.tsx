import { loadClienteOrForbid } from "../../../_data";
import { loadLoja } from "../_data";
import { LojaDadosForm } from "./loja-dados-form";

export default async function LojaDadosPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { isVendedor } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);
  // Vendedor (kind=usuario) é read-only.
  const canEdit = !isVendedor;
  return <LojaDadosForm clienteId={clienteId} loja={loja} canEdit={canEdit} />;
}
