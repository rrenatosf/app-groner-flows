import { forbidden } from "next/navigation";
import { loadClienteOrForbid } from "../_data";
import { ColunasCrmForm } from "./colunas-crm-form";

export default async function ColunasCrmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { cliente, isSuper } = await loadClienteOrForbid(Number(id));
  if (!isSuper) forbidden();
  return <ColunasCrmForm cliente={cliente} />;
}
