import { isPlaceholderLoja, type Loja } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../../_data";
import { loadVendedor } from "../_data";
import { VendedorDadosForm } from "./vendedor-dados-form";

export default async function VendedorDadosPage({
  params,
}: {
  params: Promise<{ id: string; vendedorUid: string }>;
}) {
  const { id, vendedorUid } = await params;
  const clienteId = Number(id);
  const { isSuper, isVendedor, vendedorUserId } =
    await loadClienteOrForbid(clienteId);
  const vendedor = await loadVendedor(clienteId, vendedorUid);

  // canEdit alinhado ao server (`usuarios/actions.ts::loadAndAuthorize`):
  // super OU cliente admin OU vendedor com role=owner. Vendedor comum
  // (não-owner) NÃO edita pra evitar UX "salvar fantasma" — o server
  // rejeitaria com erro genérico. Voiding `vendedor`/`vendedorUserId` no
  // ramo é proposital pra TS.
  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (!isVendedor) canEdit = true;
  else {
    const vendedoresAll = await loadVendedoresFromCliente(clienteId);
    const me = vendedoresAll.find((v) => v.id === vendedorUserId);
    if (me?.role === "owner") canEdit = true;
  }

  // Lojas do cliente — pra checkboxes vinculadas.
  const row = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const lojasArr = Array.isArray(row?.lojas) ? (row.lojas as Loja[]) : [];
  const lojasDoCliente = lojasArr
    .filter((l) => !isPlaceholderLoja(l))
    .map((l) => ({ id: l.id, nome: l.nome ?? "(sem nome)" }));

  return (
    <VendedorDadosForm
      clienteId={clienteId}
      vendedor={vendedor}
      lojasDoCliente={lojasDoCliente}
      canEdit={canEdit}
    />
  );
}
