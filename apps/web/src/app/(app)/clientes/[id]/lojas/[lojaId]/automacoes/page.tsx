import {
  loadCatalogoAtivo,
  loadClienteOrForbid,
  loadInstanciasFromLoja,
} from "../../../_data";
import { loadLoja } from "../_data";
import { ClienteAutomacoesTable } from "../../../automacoes/cliente-automacoes-table";

export default async function LojaAutomacoesPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { isSuper, session, cliente } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);

  const [rows, catalogo] = await Promise.all([
    loadInstanciasFromLoja(clienteId, lojaId),
    loadCatalogoAtivo(),
  ]);

  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = isSuper || session.kind === "cliente";

  // Apenas essa loja no escopo do drilldown.
  const lojas = [
    { id: loja.id, nome: loja.nome, crm_id: loja.crm_id ?? null },
  ];

  return (
    <div>
      <ClienteAutomacoesTable
        rows={rows}
        clienteId={clienteId}
        cliente={{
          crmTenant: cliente.crmTenant ?? null,
          crmToken: cliente.crmToken ?? null,
        }}
        isSuper={isSuper}
        canEdit={canEdit}
        lojas={lojas}
        catalogo={catalogo}
        crmColunas={cliente.crmStatusColunas}
        embedded
        embeddedLojaId={loja.id}
      />
    </div>
  );
}
