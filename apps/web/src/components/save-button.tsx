"use client";

import { useFormStatus } from "react-dom";

export function SaveButton({
  children = "Salvar",
}: {
  children?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Salvando..." : children}
    </button>
  );
}
