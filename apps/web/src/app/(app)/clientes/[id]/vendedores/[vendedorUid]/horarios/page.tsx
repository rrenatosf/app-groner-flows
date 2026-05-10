import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../../_data";
import { loadVendedor } from "../_data";
import { HorariosForm } from "./horarios-form";

export default async function VendedorHorariosPage({
  params,
}: {
  params: Promise<{ id: string; vendedorUid: string }>;
}) {
  const { id, vendedorUid } = await params;
  const clienteId = Number(id);
  const { isSuper, isVendedor, vendedorUserId } =
    await loadClienteOrForbid(clienteId);
  const vendedor = await loadVendedor(clienteId, vendedorUid);

  // canEdit alinhado ao server (vendedor comum não edita horários — só
  // super, cliente admin, ou vendedor role=owner).
  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (!isVendedor) canEdit = true;
  else {
    const vendedoresAll = await loadVendedoresFromCliente(clienteId);
    const me = vendedoresAll.find((v) => v.id === vendedorUserId);
    if (me?.role === "owner") canEdit = true;
  }

  return (
    <HorariosForm clienteId={clienteId} vendedor={vendedor} canEdit={canEdit} />
  );
}
