import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import RatingSummary from "@/components/rating-summary";

// Tarjeta de post reutilizable por el home (variante grid) y por el sidebar de
// "artículos relacionados" del post (variante compact). La meta es contextual:
// estrellas+rating, contador de vistas o fecha, según la sección que la use.

export type PostCardMeta =
  | { kind: "rating"; average: number | null; count: number }
  | { kind: "views"; count: number }
  | { kind: "date"; date: string }
  | { kind: "none" };

type PostCardProps = {
  id: string;
  title: string;
  imageUrl: string | null;
  meta?: PostCardMeta;
  variant?: "grid" | "compact";
  priority?: boolean;
};

const numberFormatter = new Intl.NumberFormat("es-AR");

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date
    .toLocaleDateString("es-AR", { month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();
}

function MetaLine({ meta }: { meta: PostCardMeta }) {
  switch (meta.kind) {
    case "rating":
      return (
        <RatingSummary
          average={meta.average}
          count={meta.count}
          starSize={14}
          className="flex items-center gap-1.5"
          textClassName="text-xs font-medium text-[var(--foreground)]"
          countClassName="text-[11px] text-[var(--text-muted)]"
        />
      );
    case "views": {
      const label = meta.count === 1 ? "vista" : "vistas";
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Eye className="h-3.5 w-3.5 text-[var(--primary)]" />
          {numberFormatter.format(meta.count)} {label}
        </span>
      );
    }
    case "date":
      return (
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {formatDate(meta.date)}
        </span>
      );
    case "none":
    default:
      return null;
  }
}

function GradientPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`h-full w-full bg-[linear-gradient(135deg,#16212a_0%,#11161d_50%,#1f2730_100%)] ${className ?? ""}`}
    />
  );
}

export default function PostCard({
  id,
  title,
  imageUrl,
  meta = { kind: "none" },
  variant = "grid",
  priority = false,
}: PostCardProps) {
  if (variant === "compact") {
    return (
      <Link href={`/post/${id}`} className="group flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#3c4b3a]/30 bg-[#181c20] transition-colors group-hover:border-[#40fe6d]/50">
          {imageUrl ? (
            <Image src={imageUrl} alt={title} fill sizes="160px" quality={80} className="object-cover" />
          ) : (
            <GradientPlaceholder />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-bold text-white transition-colors group-hover:text-[var(--primary)]">
            {title}
          </h4>
          <div className="mt-1">
            <MetaLine meta={meta} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/post/${id}`} className="group block h-full">
      <article className="relative isolate flex h-full flex-col overflow-hidden rounded-2xl bg-[var(--surface-low)]">
        <div className="relative aspect-[16/9] w-full">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover transition duration-500 group-hover:brightness-110"
            />
          ) : (
            <GradientPlaceholder />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <h4 className="line-clamp-2 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
              {title}
            </h4>
            {meta.kind !== "none" ? (
              <div className="mt-2">
                <MetaLine meta={meta} />
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  );
}
