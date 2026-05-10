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
  const { isVendedor, isSuper } = await loadClienteOrForbid(clienteId);
  const loja = await loadLoja(clienteId, lojaId);
  // Vendedor (kind=usuario) é read-only. Super edita tudo. Cliente comum
  // edita só endereço + regras (campos sensíveis tipo nome/CRM ID/CNPJ
  // ficam travados pra evitar quebrar workflow N8N e CRM externo).
  const editScope: "all" | "endereco-regras" | "none" = isVendedor
    ? "none"
    : isSuper
      ? "all"
      : "endereco-regras";
  return (
    <LojaDadosForm
      clienteId={clienteId}
      loja={loja}
      editScope={editScope}
    />
  );
}
