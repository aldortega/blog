import { publicServerClient } from "@/lib/supabase/public-server";
import { CreatePostCta } from "@/components/create-post-cta";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 300;

const HOME_POSTS_LIMIT = 30;

type HomePost = {
  id: string;
  title: string;
  excerpt: string | null;
  created_at: string;
  image_path: string | null;
};

type HomeRatingAggregateRow = {
  post_id: string;
  score: number | string;
};

export default async function Home() {
  const supabase = publicServerClient;

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, excerpt, created_at, image_path")
    .order("created_at", { ascending: false })
    .limit(HOME_POSTS_LIMIT);

  const postList = (posts ?? []) as HomePost[];
  const postIds = postList.map((post) => post.id);
  const ratingAggregateQuery =
    postIds.length === 0
      ? Promise.resolve({ data: [] as HomeRatingAggregateRow[] })
      : supabase
          .from("ratings")
          .select("post_id, score")
          .in("post_id", postIds);
  const { data: ratingAggregates } = await ratingAggregateQuery;
  const ratingRows = (ratingAggregates ?? []) as HomeRatingAggregateRow[];
  const ratingByPost = new Map<
    string,
    {
      ratingsCount: number;
      scoreSum: number;
    }
  >();

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
    const ratingsCount = rating?.ratingsCount ?? 0;
    const averageRating = rating && rating.ratingsCount > 0 ? rating.scoreSum / rating.ratingsCount : null;

    return {
      ...post,
      imageUrl,
      ratingsCount,
      averageRating,
    };
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

  const featuredPost = sortedPosts[0] ?? null;
  const remainingPosts = sortedPosts.slice(1);

  return (
    <div className="home-scroll-gradient">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h2 className="mt-4 max-w-2xl text-5xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-6xl">
              Blog
            </h2>
            <p className="font-body mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
              Ensayos de cine, analisis visual y relatos de comunidad en torno al
              cruce entre peliculas e inteligencia artificial.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-start lg:justify-end">
            <CreatePostCta />
          </div>
        </section>

        {featuredPost ? (
          <section className="mt-12">
            <Link href={`/post/${featuredPost.id}`} className="group block">
              <article className="relative isolate overflow-hidden rounded-2xl bg-[var(--surface-low)]">
                <div className="relative aspect-[16/9] w-full">
                  {featuredPost.imageUrl ? (
                    <Image
                      src={featuredPost.imageUrl}
                      alt={featuredPost.title}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 1200px"
                      className="object-cover transition duration-500 group-hover:brightness-110"
                    />
                  ) : (
                    <div className="h-full w-full bg-[linear-gradient(135deg,#16212a_0%,#11161d_50%,#1f2730_100%)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/35 to-transparent" />
                </div>

                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
                  <p className="inline-flex rounded-md bg-[rgb(64_254_109_/_0.18)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    Post destacado
                  </p>
                  <h3 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
                    {featuredPost.title}
                  </h3>
                  <p className="font-body mt-3 max-w-2xl text-sm text-[var(--text-muted)] sm:text-base">
                    {featuredPost.excerpt ??
                      "Lectura destacada de esta semana con foco en imagen, tono y narrativa."}
                  </p>
                </div>
              </article>
            </Link>
          </section>
        ) : (
          <section className="mt-12 rounded-2xl bg-[var(--surface-low)] p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              Blog
            </p>
            <h3 className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
              Todavia no hay posteos
            </h3>
            <p className="font-body mt-3 max-w-2xl text-[var(--text-muted)]">
              Publica el primer analisis para empezar a construir el archivo
              editorial del blog.
            </p>
            <CreatePostCta label="Escribir primer post" className="mt-7 px-5 sm:px-6" />
          </section>
        )}

        {remainingPosts.length > 0 ? (
          <section className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {remainingPosts.map((post) => (
              <Link key={post.id} href={`/post/${post.id}`} className="group block">
                <article className="h-full rounded-2xl bg-[var(--surface-low)] p-3 transition hover:bg-[var(--surface-high)]">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[var(--surface-high)]">
                    {post.imageUrl ? (
                      <Image
                        src={post.imageUrl}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:brightness-110"
                      />
                    ) : (
                      <div className="h-full w-full bg-[linear-gradient(140deg,#1a2732_0%,#1a1f26_55%,#1f2432_100%)]" />
                    )}
                  </div>

                  <div className="px-1 pb-2 pt-4">
                    <h4 className="line-clamp-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                      {post.title}
                    </h4>
                    <p className="font-body mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {post.excerpt ?? "Sin resumen disponible para este articulo."}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
