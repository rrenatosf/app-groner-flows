import { loadClienteOrForbid } from "../../../_data";
import { loadLoja } from "../_data";
import { LojaDadosForm } from "./loja-dados-form";

export default async function LojaDadosPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { isSuper } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);
  // Apenas super edita dados da loja. Cliente comum + vendedor =
  // read-only — editar dados aqui quebra workflows N8N e desincroniza
  // CRM. Único lugar onde o cliente edita é a aba Agentes.
  const editScope: "all" | "endereco-regras" | "none" = isSuper
    ? "all"
    : "none";
  return (
    <LojaDadosForm
      clienteId={clienteId}
      loja={loja}
      editScope={editScope}
    />
  );
}
