import { publicServerClient } from "@/lib/supabase/public-server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = 300;

const SECTION_POSTS_LIMIT = 60;

type SectionPageProps = {
  params: Promise<{ slug: string }>;
};

type SectionPost = {
  id: string;
  title: string;
  created_at: string;
  image_path: string | null;
};

type RatingAggregateRow = {
  post_id: string;
  score: number | string;
};

async function loadCategory(slug: string) {
  const { data } = await publicServerClient
    .from("categories")
    .select("id, name, slug, description")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) {
    return { title: "Categoria no encontrada" };
  }
  return {
    title: `${category.name} — Repositorio de Sistemas Inteligentes`,
    description:
      category.description ?? `Articulos de la categoria ${category.name}.`,
  };
}

export default async function SectionPage({ params }: SectionPageProps) {
  const { slug } = await params;
  const supabase = publicServerClient;

  const category = await loadCategory(slug);
  if (!category) {
    notFound();
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, created_at, image_path")
    .eq("category_id", category.id)
    .order("created_at", { ascending: false })
    .limit(SECTION_POSTS_LIMIT);

  const postList = (posts ?? []) as SectionPost[];
  const postIds = postList.map((post) => post.id);
  const { data: ratingAggregates } =
    postIds.length === 0
      ? { data: [] as RatingAggregateRow[] }
      : await supabase.from("ratings").select("post_id, score").in("post_id", postIds);
  const ratingRows = (ratingAggregates ?? []) as RatingAggregateRow[];

  const ratingByPost = new Map<string, { ratingsCount: number; scoreSum: number }>();
  for (const rating of ratingRows) {
    const score = Number(rating.score);
    if (!Number.isFinite(score)) {
      continue;
    }
    const current = ratingByPost.get(rating.post_id) ?? { ratingsCount: 0, scoreSum: 0 };
    current.ratingsCount += 1;
    current.scoreSum += score;
    ratingByPost.set(rating.post_id, current);
  }

  const normalizedPosts = postList.map((post) => {
    const imageUrl = post.image_path
      ? supabase.storage.from("post-images").getPublicUrl(post.image_path).data.publicUrl
      : null;
    const rating = ratingByPost.get(post.id);
    const averageRating = rating && rating.ratingsCount > 0 ? rating.scoreSum / rating.ratingsCount : null;
    return { ...post, imageUrl, ratingsCount: rating?.ratingsCount ?? 0, averageRating };
  });

  const sortedPosts = [...normalizedPosts].sort((a, b) => {
    const aHasRatings = a.averageRating !== null;
    const bHasRatings = b.averageRating !== null;
    if (aHasRatings !== bHasRatings) {
      return aHasRatings ? -1 : 1;
    }
    if (a.averageRating !== b.averageRating) {
      return (b.averageRating ?? -1) - (a.averageRating ?? -1);
    }
    if (a.ratingsCount !== b.ratingsCount) {
      return b.ratingsCount - a.ratingsCount;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="home-scroll-gradient">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <nav className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          <Link href="/" className="transition-colors hover:text-[var(--primary)]">
            Inicio
          </Link>
          <span className="mx-2 text-[var(--text-muted)]/50">/</span>
          <span className="text-[var(--foreground)]">{category.name}</span>
        </nav>

        <header className="max-w-2xl">
          <p className="inline-flex rounded-md bg-[rgb(64_254_109_/_0.18)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
            Categoria
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-5xl">
            {category.name}
          </h1>
          {category.description ? (
            <p className="font-body mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
              {category.description}
            </p>
          ) : null}
        </header>

        {sortedPosts.length > 0 ? (
          <section className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sortedPosts.map((post) => (
              <Link key={post.id} href={`/post/${post.id}`} className="group block">
                <article className="relative isolate h-full overflow-hidden rounded-2xl bg-[var(--surface-low)]">
                  <div className="relative aspect-[16/9] w-full">
                    {post.imageUrl ? (
                      <Image
                        src={post.imageUrl}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:brightness-110"
                      />
                    ) : (
                      <div className="h-full w-full bg-[linear-gradient(135deg,#16212a_0%,#11161d_50%,#1f2730_100%)]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/35 to-transparent" />
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <h4 className="line-clamp-2 max-w-4xl text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
                      {post.title}
                    </h4>
                  </div>
                </article>
              </Link>
            ))}
          </section>
        ) : (
          <section className="mt-10 rounded-2xl bg-[var(--surface-low)] p-10">
            <h3 className="text-2xl font-semibold text-[var(--foreground)]">
              Todavia no hay articulos en esta categoria
            </h3>
            <p className="font-body mt-3 max-w-2xl text-[var(--text-muted)]">
              Cuando se publiquen articulos en {category.name}, apareceran aca.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
