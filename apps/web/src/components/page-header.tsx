export function PageHeader({
  title,
  titleAside,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  /** Renderizado ao lado do título (ex: tooltip de ajuda). */
  titleAside?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="px-7 pt-9 pb-5 flex items-end justify-between flex-wrap gap-4 fade-in">
      <div className="max-w-2xl">
        {eyebrow && <div className="label-eyebrow mb-2">{eyebrow}</div>}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="serif text-[34px] sm:text-[40px] leading-[1.05] font-normal text-[color:var(--fg)]">
            {title}
          </h1>
          {titleAside}
        </div>
        {subtitle && (
          <p className="text-[13.5px] text-[color:var(--fg-muted)] mt-2.5 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
