import type { ReactNode } from "react";

// Sección con título del home reestructurado: un encabezado (con subtítulo
// opcional, ej. "Porque leíste {título}") + una grilla de tarjetas. La página
// decide qué renderizar adentro; si no hay hijos, no debe montar esta sección.

type HomeSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function HomeSection({ title, subtitle, children }: HomeSectionProps) {
  return (
    <section className="mt-12">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
          {title}
        </h3>
        {subtitle ? (
          <span className="truncate text-xs text-[var(--text-muted)]">{subtitle}</span>
        ) : null}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
