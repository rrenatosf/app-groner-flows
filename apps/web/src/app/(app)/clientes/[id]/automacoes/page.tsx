import { AutomacoesTable, type LojaOption } from "../../../automacoes/automacoes-table";
import {
  loadAutomacoesFromCliente,
  loadClienteOrForbid,
  loadLojasVisiveis,
} from "../_data";

export default async function ClienteAutomacoesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, session } = await loadClienteOrForbid(clienteId);

  const rows = await loadAutomacoesFromCliente(clienteId);
  const lojasVisiveis = await loadLojasVisiveis(clienteId);

  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = isSuper || session.kind === "cliente";

  // Lojas pickers — só do próprio cliente, filtradas pelo caller.
  const lojas: LojaOption[] = lojasVisiveis.map((l) => ({
    id: l.id,
    nome: l.nome,
    clienteId,
  }));

  // Auto-seleciona o cliente do drilldown no NovoModal.
  const clientesPicker = [
    { id: cliente.id, nome: cliente.nome ?? `Cliente #${cliente.id}` },
  ];

  return (
    <div>
      <AutomacoesTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        clientes={clientesPicker}
        lojas={lojas}
        embedded
      />
    </div>
  );
}
