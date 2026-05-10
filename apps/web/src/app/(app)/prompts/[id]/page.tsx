import Link from "next/link";
import { notFound } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { getAgenteById } from "@/server/services/agentes";
import { PageHeader } from "@/components/page-header";

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const { id } = await params;
  const agenteId = Number(id);
  if (!Number.isFinite(agenteId)) notFound();

  const a = await getAgenteById(session.clienteId, agenteId);
  if (!a || !a.prompt) notFound();

  return (
    <>
      <PageHeader
        title={a.name}
        subtitle={a.description ?? "Prompt configurado para esta automação."}
        actions={
          <Link
            href="/prompts"
            className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
          >
            ← Voltar
          </Link>
        }
      />

      <div className="px-6 pb-12 space-y-6">
        <section className="rounded-lg border border-[color:var(--b-soft)] bg-[color:var(--ink-3)] p-5 grid gap-3 sm:grid-cols-3">
          <Field label="Status" value={a.isActive ? "ativo" : "inativo"} />
          <Field label="Debounce" value={`${a.debounceTime}s`} />
          <Field label="Max follow-ups" value={String(a.maxFollowups)} />
          <Field
            label="Intervenção humana"
            value={a.humanIntervention ? "sim" : "não"}
          />
          <Field label="Voz" value={a.voiceGender ?? "—"} />
          <Field label="n8n" value={a.idN8n ?? "—"} />
        </section>

        <section className="rounded-lg border border-[color:var(--b-soft)] bg-[color:var(--ink-3)] p-5">
          <h2 className="font-semibold">Prompt</h2>
          <p className="text-[color:var(--fg-subtle)] text-xs mt-1">
            Read-only. Edição inline e teste com persona/juiz virão em fase 2.
          </p>
          <pre className="mt-4 rounded-md bg-[color:var(--ink-2)] border border-[color:var(--b-soft)] p-4 text-sm text-[color:var(--fg)] whitespace-pre-wrap font-mono leading-relaxed max-h-[60vh] overflow-auto">
            {a.prompt}
          </pre>
        </section>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[color:var(--fg-subtle)] text-xs uppercase tracking-wider">{label}</p>
      <p className="font-mono text-sm mt-1">{value}</p>
    </div>
  );
}
