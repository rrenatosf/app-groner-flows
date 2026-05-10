import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
