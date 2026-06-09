import { publicServerClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import { relationFirst } from "@/lib/supabase/relation-utils";
import { resolveAvatarSrc } from "@/lib/avatar";
import type { RelationOneOrMany } from "@/lib/supabase/relation-utils";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpDown, Clock, MessageSquare, Plus, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Foro — Sistemas Inteligentes",
  description: "Debate comunitario sobre inteligencia artificial y sistemas inteligentes.",
};

const THREADS_PAGE_SIZE = 20;

type ForumTab = "top" | "nuevos";

type ThreadRow = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  score: number;
  reply_count: number;
  created_at: string;
  category_id: string;
  categories: RelationOneOrMany<{ name: string | null; slug: string | null }>;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

type ForumPageProps = {
  searchParams: Promise<{ tab?: string; categoria?: string; page?: string }>;
};

function snippet(markdown: string, max = 180): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // imágenes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → texto
    .replace(/[#>*_`~-]/g, "") // marcas markdown
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function formatRelative(dateString: string): string {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) return "hace un momento";
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return "hace un momento";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays} d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `hace ${diffWeeks} sem`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths} mes`;
  return `hace ${Math.floor(diffDays / 365)} año`;
}

const numberFormatter = new Intl.NumberFormat("es-AR");

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const { tab: rawTab, categoria, page: rawPage } = await searchParams;
  const tab: ForumTab = rawTab === "nuevos" ? "nuevos" : "top";
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const from = (currentPage - 1) * THREADS_PAGE_SIZE;
  const to = from + THREADS_PAGE_SIZE - 1;

  const supabasePublic = publicServerClient;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: categories } = await supabasePublic
    .from("categories")
    .select("name, slug")
    .order("name");
  const categoryList = (categories ?? []) as { name: string; slug: string }[];

  // Filtro por categoría (resolvemos slug → id).
  const activeCategory = categoria
    ? categoryList.find((category) => category.slug === categoria) ?? null
    : null;
  let activeCategoryId: string | null = null;
  if (activeCategory) {
    const { data: categoryRow } = await supabasePublic
      .from("categories")
      .select("id")
      .eq("slug", activeCategory.slug)
      .maybeSingle();
    activeCategoryId = categoryRow?.id ?? null;
  }

  let query = supabasePublic
    .from("forum_threads")
    .select(
      "id, title, body, image_path, score, reply_count, created_at, category_id, categories(name, slug), profiles(display_name, avatar_url)",
      { count: "exact" },
    );

  if (activeCategoryId) {
    query = query.eq("category_id", activeCategoryId);
  }

  query =
    tab === "top"
      ? query.order("score", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  const { data: threads, count } = await query.range(from, to);
  const threadList = (threads ?? []) as ThreadRow[];
  const totalThreads = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalThreads / THREADS_PAGE_SIZE));
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const buildHref = (overrides: { tab?: ForumTab; categoria?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const nextTab = overrides.tab ?? tab;
    if (nextTab !== "top") params.set("tab", nextTab);
    const nextCategoria = overrides.categoria === undefined ? categoria : overrides.categoria;
    if (nextCategoria) params.set("categoria", nextCategoria);
    const nextPage = overrides.page ?? 1;
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query.length > 0 ? `/foro?${query}` : "/foro";
  };

  return (
    <div className="home-scroll-gradient">
      <div className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex rounded-md bg-[rgb(64_254_109_/_0.18)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
              Foro
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-5xl">
              Debate comunitario
            </h1>
            <p className="font-body mt-3 max-w-2xl text-[var(--text-muted)]">
              Abrí hilos, respondé a otros y votá las mejores contribuciones.
            </p>
          </div>
          {user ? (
            <Link
              href={activeCategory ? `/foro/nuevo?categoria=${activeCategory.slug}` : "/foro/nuevo"}
              className="inline-flex items-center gap-2 rounded-xl bg-[#00e054] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-[#00390f] transition-colors hover:bg-[#40fe6d]"
            >
              <Plus size={16} />
              Nuevo hilo
            </Link>
          ) : null}
        </header>

        {/* Pestañas Top / Nuevos */}
        <div className="mt-8 flex items-center gap-2 border-b border-[#3c4b3a]/30 pb-3">
          <Link
            href={buildHref({ tab: "top", page: 1 })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${tab === "top"
              ? "bg-[#181c20] text-[#40fe6d]"
              : "text-[#bacbb6] hover:text-white"
              }`}
          >
            <TrendingUp size={15} />
            Top
          </Link>
          <Link
            href={buildHref({ tab: "nuevos", page: 1 })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${tab === "nuevos"
              ? "bg-[#181c20] text-[#40fe6d]"
              : "text-[#bacbb6] hover:text-white"
              }`}
          >
            <Clock size={15} />
            Nuevos
          </Link>
        </div>

        {/* Filtro por categoría */}
        {categoryList.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildHref({ categoria: null, page: 1 })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${!activeCategory
                ? "border-[#40fe6d]/60 bg-[#40fe6d]/10 text-[#40fe6d]"
                : "border-[#3c4b3a]/40 text-[#bacbb6] hover:border-[#40fe6d]/40 hover:text-white"
                }`}
            >
              Todas
            </Link>
            {categoryList.map((category) => (
              <Link
                key={category.slug}
                href={buildHref({ categoria: category.slug, page: 1 })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${activeCategory?.slug === category.slug
                  ? "border-[#40fe6d]/60 bg-[#40fe6d]/10 text-[#40fe6d]"
                  : "border-[#3c4b3a]/40 text-[#bacbb6] hover:border-[#40fe6d]/40 hover:text-white"
                  }`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        ) : null}

        {/* Listado de hilos */}
        <section className="mt-8 space-y-3">
          {threadList.length === 0 ? (
            <div className="rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-10 text-center">
              <h3 className="text-xl font-semibold text-white">Todavía no hay hilos acá</h3>
              <p className="font-body mt-2 text-sm text-[#bacbb6]">
                {user
                  ? "Sé la primera persona en abrir un debate."
                  : "Inicia sesión con Google para abrir el primer debate."}
              </p>
            </div>
          ) : (
            threadList.map((thread) => {
              const category = relationFirst(thread.categories);
              const author = relationFirst(thread.profiles);
              const authorName = author?.display_name?.trim() || "Usuario";
              const authorAvatar = resolveAvatarSrc(author?.avatar_url ?? "", authorName, {
                background: "262a2f",
                color: "e0e3e8",
              });
              const imageUrl = thread.image_path
                ? supabasePublic.storage.from("forum-images").getPublicUrl(thread.image_path).data.publicUrl
                : null;

              return (
                <Link
                  key={thread.id}
                  href={`/foro/${thread.id}`}
                  className="group flex gap-4 rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] p-5 transition-colors hover:border-[#40fe6d]/40"
                >
                  {/* Puntaje (lectura; se vota dentro del hilo) */}
                  <div className="flex shrink-0 flex-col items-center justify-start pt-1">
                    <ArrowUpDown size={16} className="text-[#bacbb6]" />
                    <span className="mt-1 text-sm font-bold tabular-nums text-[#e0e3e8]">
                      {numberFormatter.format(thread.score)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#bacbb6]">
                      {category?.name ? (
                        <span className="rounded bg-[#40fe6d]/10 px-2 py-0.5 text-[#40fe6d]">
                          {category.name}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1.5">
                        <span className="relative inline-block h-4 w-4 overflow-hidden rounded-full">
                          <Image src={authorAvatar} alt={authorName} fill sizes="16px" className="object-cover" />
                        </span>
                        {authorName}
                      </span>
                      <span>· {formatRelative(thread.created_at)}</span>
                    </div>

                    <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-white transition-colors group-hover:text-[#40fe6d]">
                      {thread.title}
                    </h3>
                    {snippet(thread.body) ? (
                      <p className="font-body mt-1 line-clamp-2 text-sm text-[#bacbb6]">{snippet(thread.body)}</p>
                    ) : null}

                    <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#bacbb6]">
                      <MessageSquare size={13} />
                      {numberFormatter.format(thread.reply_count)}{" "}
                      {thread.reply_count === 1 ? "respuesta" : "respuestas"}
                    </div>
                  </div>

                  {imageUrl ? (
                    <div className="relative hidden h-24 w-36 shrink-0 self-center overflow-hidden rounded-lg border border-[#3c4b3a]/30 sm:block">
                      <Image src={imageUrl} alt={thread.title} fill sizes="144px" className="object-cover" />
                    </div>
                  ) : null}
                </Link>
              );
            })
          )}
        </section>

        {/* Paginación */}
        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-[#3c4b3a]/20 bg-[#0b0f12] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[#bacbb6]">
            <span>
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {hasPrevious ? (
                <Link
                  href={buildHref({ page: currentPage - 1 })}
                  className="rounded-md border border-[#3c4b3a]/35 px-3 py-1.5 text-[#e0e3e8] transition hover:border-[#40fe6d]/60 hover:text-[#40fe6d]"
                >
                  Anterior
                </Link>
              ) : null}
              {hasNext ? (
                <Link
                  href={buildHref({ page: currentPage + 1 })}
                  className="rounded-md border border-[#3c4b3a]/35 px-3 py-1.5 text-[#e0e3e8] transition hover:border-[#40fe6d]/60 hover:text-[#40fe6d]"
                >
                  Siguiente
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
