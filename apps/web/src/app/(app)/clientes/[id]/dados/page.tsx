import { loadClienteOrForbid } from "../_data";
import { PendenciasBanner } from "../_components/pendencias-banner";
import { ClienteDadosForm } from "./cliente-dados-form";

export default async function ClienteDadosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { cliente, isSuper } = await loadClienteOrForbid(Number(id));
  return (
    <>
      <PendenciasBanner cliente={cliente} isSuper={isSuper} />
      <ClienteDadosForm cliente={cliente} isSuper={isSuper} />
    </>
  );
}
