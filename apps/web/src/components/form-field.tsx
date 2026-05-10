import { cn } from "@/lib/cn";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  hint,
  placeholder,
  inputClassName,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  inputClassName?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={cn("input", inputClassName)}
      />
      {hint && (
        <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 6,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className="textarea numerics text-[13px] leading-relaxed resize-y"
      />
      {hint && (
        <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

export function Toggle({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label
      className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 transition-colors hover:bg-[color:var(--ink-3)]"
      style={{
        backgroundColor: "var(--ink-2)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        className="size-4 accent-[color:var(--mint-400)]"
      />
      <span className="text-[13px]">
        <span className="text-[color:var(--fg)] font-medium">{label}</span>
        {hint && (
          <span className="block text-[11.5px] text-[color:var(--fg-subtle)] mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
        {label}
      </span>
      <select name={name} defaultValue={defaultValue ?? ""} className="select">
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
