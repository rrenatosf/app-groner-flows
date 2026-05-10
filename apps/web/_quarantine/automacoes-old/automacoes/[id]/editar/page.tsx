import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes, clientes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isOwner, isSuperadminFresh } from "@/lib/auth/guard";
import { getAgenteById } from "@/server/services/agentes";
import { PageHeader } from "@/components/page-header";
import { Field, Select, TextArea, Toggle } from "@/components/form-field";
import { SaveButton } from "@/components/save-button";
import { saveAgenteAction } from "./actions";

export default async function EditAgentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  if (!isOwner(session)) redirect("/automacoes");

  const { id } = await params;
  const agenteId = Number(id);
  if (!Number.isFinite(agenteId)) notFound();

  const isSuper = await isSuperadminFresh(session);

  // Superadmin pode editar agente de qualquer tenant. Cliente comum só
  // do próprio. Resolve o clienteId real do agente antes do lookup.
  let targetClienteId = session.clienteId;
  if (isSuper) {
    const owner = await db
      .select({ clienteId: agentes.clienteId })
      .from(agentes)
      .where(eq(agentes.id, agenteId))
      .limit(1);
    if (owner.length === 0) notFound();
    targetClienteId = owner[0].clienteId;
  }

  const a = await getAgenteById(targetClienteId, agenteId);
  if (!a) notFound();

  // Nome do tenant pra exibir no header quando cross-tenant.
  let tenantLabel: string | null = null;
  if (isSuper && targetClienteId !== session.clienteId) {
    const t = await db
      .select({ nome: clientes.nome, crmTenant: clientes.crmTenant })
      .from(clientes)
      .where(eq(clientes.id, targetClienteId))
      .limit(1);
    tenantLabel =
      t[0]?.nome ?? t[0]?.crmTenant ?? `Cliente #${targetClienteId}`;
  }

  const action = saveAgenteAction.bind(null, agenteId);

  return (
    <>
      <PageHeader
        eyebrow={tenantLabel ? `Tenant · ${tenantLabel}` : undefined}
        title={`Editar agente · ${a.name}`}
        subtitle="Mudanças refletem imediatamente para o cliente e seus usuários."
        actions={
          <Link
            href="/automacoes"
            className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
          >
            ← Voltar
          </Link>
        }
      />

      <div className="px-6 pb-12">
        <form action={action} className="grid gap-5 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="name" defaultValue={a.name} required />
            <Field
              label="ID do workflow n8n"
              name="idN8n"
              defaultValue={a.idN8n}
              hint="Vazio se não houver."
            />
          </div>

          <Field
            label="Descrição"
            name="description"
            defaultValue={a.description}
            placeholder="Descrição curta do agente"
          />

          <TextArea
            label="Prompt do agente"
            name="prompt"
            defaultValue={a.prompt}
            rows={14}
            hint="Sessões e instruções que orientam o comportamento do agente."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Debounce (segundos)"
              name="debounceTime"
              type="number"
              defaultValue={a.debounceTime}
            />
            <Field
              label="Max follow-ups"
              name="maxFollowups"
              type="number"
              defaultValue={a.maxFollowups}
            />
            <Select
              label="Voz"
              name="voiceGender"
              defaultValue={a.voiceGender ?? ""}
              options={[
                { value: "female", label: "Feminina" },
                { value: "male", label: "Masculina" },
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle
              label="Intervenção humana"
              name="humanIntervention"
              defaultChecked={a.humanIntervention}
              hint="Se ativo, agente entrega ao humano em casos previstos."
            />
            <Toggle
              label="Ativo"
              name="isActive"
              defaultChecked={a.isActive}
              hint="Desativar para pausar o agente sem deletá-lo."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href="/automacoes"
              className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] px-3 py-2"
            >
              Cancelar
            </Link>
            <SaveButton />
          </div>
        </form>
      </div>
    </>
  );
}
