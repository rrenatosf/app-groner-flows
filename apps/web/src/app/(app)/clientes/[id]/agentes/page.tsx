import { AgentesTable } from "../../../agentes/agentes-table";
import { loadAgentesFromCliente, loadClienteOrForbid } from "../_data";

export default async function ClienteAgentesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, session } = await loadClienteOrForbid(clienteId);

  const rows = await loadAgentesFromCliente(clienteId);

  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = isSuper || session.kind === "cliente";

  // Auto-seleciona o cliente do drilldown no NovoModal — modal usa
  // `clientesPicker.length === 1` para skipar picker e fixar o cliente.
  const clientesPicker = [
    { id: cliente.id, nome: cliente.nome ?? `Cliente #${cliente.id}` },
  ];

  return (
    <div>
      <AgentesTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        clientes={clientesPicker}
        embedded
      />
    </div>
  );
}
