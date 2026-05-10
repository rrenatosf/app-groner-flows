import { loadClienteOrForbid } from "../_data";
import { ClienteDadosForm } from "./cliente-dados-form";

export default async function ClienteDadosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { cliente, isSuper } = await loadClienteOrForbid(Number(id));
  return <ClienteDadosForm cliente={cliente} isSuper={isSuper} />;
}
