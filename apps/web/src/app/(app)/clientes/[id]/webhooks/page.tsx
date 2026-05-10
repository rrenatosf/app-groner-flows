import { forbidden } from "next/navigation";
import { loadClienteOrForbid } from "../_data";
import { WebhooksTab } from "./webhooks-tab";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { cliente, isSuper } = await loadClienteOrForbid(Number(id));
  if (!isSuper) forbidden();
  return (
    <div className="p-5">
      <WebhooksTab clienteId={cliente.id} />
    </div>
  );
}
