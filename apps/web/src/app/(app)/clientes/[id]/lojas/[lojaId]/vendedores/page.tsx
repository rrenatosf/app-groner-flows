import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../../_data";
import { loadLoja } from "../_data";
import {
  UsuariosTable,
  type UsuarioRow,
} from "../../../../../usuarios/usuarios-table";

export default async function LojaVendedoresPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, vendedorUserId } =
    await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);

  // Filtra vendedores do cliente que estão vinculados a essa loja.
  let vendedoresAll = await loadVendedoresFromCliente(clienteId);
  let vendedores = vendedoresAll.filter((v) => v.loja_ids.includes(loja.id));
  // Vendedor (kind=usuario) só vê o próprio uid (e só se vinculado).
  if (isVendedor && vendedorUserId !== null) {
    vendedores = vendedores.filter((v) => v.id === vendedorUserId);
  }

  // canEdit segue regra padrão.
  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (!isVendedor) canEdit = true;
  else {
    const me = vendedoresAll.find((v) => v.id === vendedorUserId);
    if (me?.role === "owner") canEdit = true;
  }

  // lojasMap só inclui essa loja — cobre necessidade da tabela sem
  // expor outras lojas no contexto do drilldown.
  const lojasMap: Record<string, string> = { [loja.id]: loja.nome ?? "(sem nome)" };
  const lojasDoCliente = [{ id: loja.id, nome: loja.nome ?? "(sem nome)" }];

  const rows: UsuarioRow[] = vendedores.map((v) => ({
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    vendedor: v,
    lojasMap,
    lojasDoCliente,
  }));

  return (
    <UsuariosTable
      rows={rows}
      isSuper={isSuper}
      canEdit={canEdit}
      embedded
      embeddedClienteId={cliente.id}
      embeddedClienteNome={
        cliente.nome ?? cliente.crmTenant ?? `Cliente #${cliente.id}`
      }
      embeddedLojasDoCliente={lojasDoCliente}
      embeddedLojaIdPreSelected={loja.id}
    />
  );
}
