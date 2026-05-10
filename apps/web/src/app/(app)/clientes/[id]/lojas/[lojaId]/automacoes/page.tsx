import {
  AutomacoesTable,
  type LojaOption,
} from "../../../../../automacoes/automacoes-table";
import {
  loadAutomacoesFromLoja,
  loadClienteOrForbid,
} from "../../../_data";
import { loadLoja } from "../_data";

export default async function LojaAutomacoesPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, session } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);

  const rows = await loadAutomacoesFromLoja(clienteId, lojaId);

  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = isSuper || session.kind === "cliente";

  // Lojas pickers — só essa loja (escopo do drilldown).
  const lojas: LojaOption[] = [{ id: loja.id, nome: loja.nome, clienteId }];

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
