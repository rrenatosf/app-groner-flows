"use client";

import type { CrmStatus } from "@/server/actions/cliente-crm";
import type { CrmStatusSlot } from "@/lib/db/schema";
import { COLUNA_SLOT_FIELDS } from "../dados-config-shape";
import {
  type FieldKind,
  inferFieldKind,
  isColunaGroup,
  sortFields,
} from "../dados-config-form";
import { ColunaPickerLive } from "./ColunaPickerLive";
import { FieldInput } from "./FieldInput";

/** Campos canonical do picker live (controlados pelo picker, não
 *  renderizados como input livre). Inclui os 4 do slot + 2 extras
 *  injetados pelo live: `etapa_id`, `etapa_nome`. */
const PICKER_CONTROLLED = new Set<string>([
  ...COLUNA_SLOT_FIELDS,
  "etapa_id",
  "etapa_nome",
]);

/** Renderiza os campos internos de UM grupo. Pra grupos `coluna_*`
 *  delega ao ColunaPickerLive (6 campos casados — 4 canonical + 2 etapa).
 *  Pra grupos comuns, uma row por campo, ordenada por kind. */
export function GroupFields({
  groupName,
  groupValue,
  onChange,
  crmColunas,
  liveList,
  pendingLive,
  liveErr,
  refreshLive,
  disabled,
}: {
  groupName: string;
  groupValue: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  crmColunas: CrmStatusSlot[] | null;
  liveList: CrmStatus[] | null;
  pendingLive: boolean;
  liveErr: string | null;
  refreshLive: () => void;
  disabled?: boolean;
}) {
  if (isColunaGroup(groupName)) {
    // Picker controla campos canonical + etapa_id/etapa_nome. Campos
    // extras do template (ex: kanban_pos) são editáveis livre abaixo.
    const extraEntries = Object.entries(groupValue).filter(
      ([k]) => !PICKER_CONTROLLED.has(k),
    );
    type EntryKind = { key: string; value: unknown; kind: FieldKind };
    const extraSorted = sortFields(
      extraEntries.map<EntryKind>(([k, v]) => ({
        key: k,
        value: v,
        kind: inferFieldKind(v),
      })),
    );
    return (
      <div className="flex flex-col gap-3">
        <ColunaPickerLive
          groupName={groupName}
          groupValue={groupValue}
          onChange={onChange}
          liveList={liveList}
          cachedColunas={crmColunas}
          pending={pendingLive}
          fetchError={liveErr}
          onRefresh={refreshLive}
          disabled={disabled}
        />
        {extraSorted.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            {extraSorted.map((e) => (
              <div
                key={e.key}
                className={
                  e.kind.kind === "array-string" ||
                  e.kind.kind === "array-number" ||
                  e.kind.kind === "unsupported"
                    ? "sm:col-span-2"
                    : undefined
                }
              >
                <FieldInput
                  fieldKey={e.key}
                  kind={e.kind}
                  value={e.value}
                  onChange={(next) => {
                    onChange({ ...groupValue, [e.key]: next });
                  }}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const entries = Object.entries(groupValue);
  type EntryKind = { key: string; value: unknown; kind: FieldKind };
  const withKind: EntryKind[] = entries.map(([k, v]) => ({
    key: k,
    value: v,
    kind: inferFieldKind(v),
  }));
  const sorted = sortFields(withKind);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {sorted.map((e) => (
        <div
          key={e.key}
          className={
            e.kind.kind === "array-string" ||
            e.kind.kind === "array-number" ||
            e.kind.kind === "unsupported"
              ? "sm:col-span-2"
              : undefined
          }
        >
          <FieldInput
            fieldKey={e.key}
            kind={e.kind}
            value={e.value}
            onChange={(next) => {
              onChange({ ...groupValue, [e.key]: next });
            }}
            disabled={disabled}
          />
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-[11px] text-[color:var(--fg-subtle)] sm:col-span-2">
          (grupo vazio — nenhum campo definido pelo template do catálogo)
        </p>
      )}
    </div>
  );
}
