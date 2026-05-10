import { redirect } from "next/navigation";

export default async function LojaDrilldownIndex({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  redirect(`/clientes/${id}/lojas/${lojaId}/dados`);
}
