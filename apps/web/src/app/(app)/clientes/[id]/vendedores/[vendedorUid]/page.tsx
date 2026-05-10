import { redirect } from "next/navigation";

export default async function VendedorDrilldownIndex({
  params,
}: {
  params: Promise<{ id: string; vendedorUid: string }>;
}) {
  const { id, vendedorUid } = await params;
  redirect(`/clientes/${id}/vendedores/${vendedorUid}/dados`);
}
