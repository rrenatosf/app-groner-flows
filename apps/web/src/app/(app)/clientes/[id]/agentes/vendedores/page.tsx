import { isPlaceholderLoja, type Loja } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../_data";
import {
  UsuariosTable,
  type UsuarioRow,
} from "../../../../usuarios/usuarios-table";

export default async function ClienteVendedoresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, vendedorUserId } =
    await loadClienteOrForbid(clienteId);

  let vendedores = await loadVendedoresFromCliente(clienteId);
  // Vendedor (kind=usuario) só vê o próprio uid.
  if (isVendedor && vendedorUserId !== null) {
    vendedores = vendedores.filter((v) => v.id === vendedorUserId);
  }

  // canEdit: super OK; cliente kind=cliente OK; vendedor kind=usuario
  // OK só se role=owner. Mesma regra da page raiz.
  let canEdit = false;
  if (isSuper) canEdit = true;
  else if (!isVendedor) canEdit = true;
  else {
    const me = vendedores.find((v) => v.id === vendedorUserId);
    if (me?.role === "owner") canEdit = true;
  }

  // Carrega lojas pra montar lojasMap/lojasDoCliente exigido por
  // UsuariosTable (igual à page raiz de /usuarios).
  const row = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
  const lojasArr = Array.isArray(row?.lojas) ? (row.lojas as Loja[]) : [];
  const lojasValid = lojasArr.filter((l) => !isPlaceholderLoja(l));
  const lojasMap: Record<string, string> = {};
  const lojasDoCliente: { id: string; nome: string }[] = [];
  for (const l of lojasValid) {
    if (typeof l.id === "string" && l.id) {
      lojasMap[l.id] = l.nome ?? "(sem nome)";
      lojasDoCliente.push({ id: l.id, nome: l.nome ?? "(sem nome)" });
    }
  }

  const rows: UsuarioRow[] = vendedores.map((v) => ({
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    vendedor: v,
    lojasMap,
    lojasDoCliente,
  }));

  return (
    <div>
      <UsuariosTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        embedded
        embeddedClienteId={cliente.id}
        embeddedClienteNome={cliente.nome ?? cliente.crmTenant ?? `Cliente #${cliente.id}`}
        embeddedLojasDoCliente={lojasDoCliente}
      />
    </div>
  );
}
