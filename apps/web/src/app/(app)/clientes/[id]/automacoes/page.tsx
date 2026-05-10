import {
  loadCatalogoAtivo,
  loadClienteOrForbid,
  loadInstanciasFromCliente,
  loadLojasVisiveis,
} from "../_data";
import { ClienteAutomacoesTable } from "./cliente-automacoes-table";

export default async function ClienteAutomacoesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { isSuper, session, cliente } = await loadClienteOrForbid(clienteId);

  const [rows, lojasVisiveis, catalogo] = await Promise.all([
    loadInstanciasFromCliente(clienteId),
    loadLojasVisiveis(clienteId),
    loadCatalogoAtivo(),
  ]);

  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = isSuper || session.kind === "cliente";

  const lojas = lojasVisiveis.map((l) => ({
    id: l.id,
    nome: l.nome,
    crm_id: l.crm_id ?? null,
  }));

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
      />
    </div>
  );
}
