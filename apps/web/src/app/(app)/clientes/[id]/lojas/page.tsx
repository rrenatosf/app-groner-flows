import { loadClienteOrForbid, loadLojasVisiveis } from "../_data";
import { LojasTable, type LojaRow } from "../../../lojas/lojas-table";

export default async function ClienteLojasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper } = await loadClienteOrForbid(clienteId);
  // Filtra lojas pela visibilidade do caller (vendedor só vê suas).
  const lojas = await loadLojasVisiveis(clienteId);

  // Dados de loja só super edita — cliente comum ou vendedor são read-only.
  // Edição inadvertida pelo cliente quebrava automações.
  const canEdit = isSuper;

  const rows: LojaRow[] = lojas.map((loja) => ({
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    loja,
  }));

  return (
    <div>
      <LojasTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        embedded
        embeddedClienteId={cliente.id}
        embeddedClienteNome={cliente.nome ?? cliente.crmTenant ?? `Cliente #${cliente.id}`}
      />
    </div>
  );
}
