import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/guard";
import { PageHeader } from "@/components/page-header";
import { NewUsuarioForm } from "./form";

export default async function NewUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    nome?: string;
    email?: string;
    celular?: string;
    crmId?: string;
  }>;
}) {
  const session = await readSession();
  if (!session) return null;
  if (!isOwner(session)) redirect("/usuarios");

  const sp = await searchParams;
  const prefillFromCrm =
    sp.nome || sp.email || sp.celular || sp.crmId
      ? {
          id: sp.crmId ? Number(sp.crmId) : 0,
          nome: sp.nome ?? "",
          email: sp.email ?? null,
          celular: sp.celular ?? null,
          ativo: true,
        }
      : null;

  return (
    <>
      <PageHeader
        eyebrow="Equipe"
        title="Novo usuário"
        subtitle="Cadastre um vendedor ou outro dono da loja com acesso completo."
        actions={
          <Link
            href="/usuarios"
            className="text-[13px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
          >
            ← Voltar
          </Link>
        }
      />
      <div className="px-7 pb-12">
        <NewUsuarioForm prefill={prefillFromCrm} />
      </div>
    </>
  );
}
