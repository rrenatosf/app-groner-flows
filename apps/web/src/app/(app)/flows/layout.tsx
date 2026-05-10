import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";

/**
 * Gate do prefixo /flows. Só superadmin Groner passa. Cliente comum
 * cai em /dashboard. Não-autenticado cai em /login.
 *
 * Verificação é fresh do banco (não confia no JWT — ele não carrega
 * mais isSuperadmin). Custo: 1 query por render do layout (cache do
 * React em RSC dilui se o mesmo segmento for renderizado várias vezes
 * dentro da mesma request).
 */
export default async function FlowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) redirect("/flows/login");
  const isSuper = await isSuperadminFresh(session);
  // Não-super (vendedor ou cliente comum) cai pro dashboard do tenant.
  if (!isSuper) redirect("/dashboard");
  return <>{children}</>;
}
