"use client";

import { useState } from "react";
import type { CrmStatus } from "@/server/actions/cliente-crm";
import type { CrmStatusSlot } from "@/lib/db/schema";
import { humanizeKey } from "../dados-config-form";
import { GroupFields } from "./GroupFields";
import { PendenciasBadge } from "./PendenciasBadge";

/** Card colapsável de UM grupo (objeto com 1 chave). Header mostra nome
 *  + badge de pendências. Conteúdo abre/fecha. */
export function GroupCard({
  groupName,
  groupValue,
  onChange,
  pendencias,
  crmColunas,
  liveList,
  pendingLive,
  liveErr,
  refreshLive,
  disabled,
  defaultOpen = true,
}: {
  groupName: string;
  groupValue: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  pendencias: number;
  crmColunas: CrmStatusSlot[] | null;
  liveList: CrmStatus[] | null;
  pendingLive: boolean;
  liveErr: string | null;
  refreshLive: () => void;
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-md"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="text-[10px] text-[color:var(--fg-subtle)]"
          >
            {open ? "▾" : "▸"}
          </span>
          <span className="text-[13px] font-medium text-[color:var(--fg)] truncate">
            {humanizeKey(groupName)}
          </span>
          <span
            className="text-[10.5px] text-[color:var(--fg-subtle)] truncate"
            title={groupName}
          >
            ({groupName})
          </span>
        </div>
        <PendenciasBadge count={pendencias} />
      </button>
      {open && (
        <div
          className="px-3 pb-3 pt-1"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <GroupFields
            groupName={groupName}
            groupValue={groupValue}
            onChange={onChange}
            crmColunas={crmColunas}
            liveList={liveList}
            pendingLive={pendingLive}
            liveErr={liveErr}
            refreshLive={refreshLive}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
