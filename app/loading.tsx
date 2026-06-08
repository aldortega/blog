// Skeleton del home mientras se resuelven sesión + RPCs (la ruta es dinámica).
// Estructura: encabezado, hero ancho y un par de secciones con grilla de tarjetas.

function CardSkeleton() {
  return <div className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-[var(--surface-low)]" />;
}

function SectionSkeleton() {
  return (
    <div className="mt-12">
      <div className="mb-5 h-3 w-40 animate-pulse rounded bg-[var(--surface-low)]" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export default function HomeLoading() {
  return (
    <div className="home-scroll-gradient">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mt-4 h-12 w-full max-w-2xl animate-pulse rounded bg-[var(--surface-low)]" />
            <div className="mt-5 h-5 w-full max-w-xl animate-pulse rounded bg-[var(--surface-low)]" />
          </div>
        </section>

        <div className="mt-10 aspect-[21/9] w-full animate-pulse rounded-2xl bg-[var(--surface-low)]" />

        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  );
}
