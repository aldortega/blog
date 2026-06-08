import { publicServerClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import { CreatePostCta } from "@/components/create-post-cta";
import PostCard, { type PostCardMeta } from "@/components/post-card";
import HomeSection from "@/components/home-section";
import RatingSummary from "@/components/rating-summary";
import Image from "next/image";
import Link from "next/link";

// Home híbrido (fase 6). Dinámico: lee la sesión por request para sumar las filas
// personalizadas "Porque leíste X". Las secciones globales salen de RPCs que agregan
// en Postgres sobre toda la biblioteca (trending_posts, top_rated_posts) y de queries
// directas (recientes, historial del usuario). Un post no se repite entre secciones:
// se reserva en cascada de arriba hacia abajo (hero → personalizadas → tendencias →
// mejor puntuados → recientes) y las secciones que quedan vacías se ocultan.

// Sin cache estática: la sesión vuelve la ruta dinámica de todos modos.
export const dynamic = "force-dynamic";

const SECTION_SIZE = 6; // ítems visibles por sección
const POOL_SIZE = 12; // over-fetch para tener relleno tras la dedup en cascada
const PERSONALIZED_ROWS = 3; // últimos N vistos distintos
const NEIGHBOR_COUNT = 8; // vecinos pedidos por cada "Porque leíste X"
const RELATED_THRESHOLD = 0.5;
const TRENDING_DAYS = 7;
const TOP_RATED_MIN_VOTES = 2;
const VIEW_HISTORY_SCAN = 200; // filas de historial a escanear para deducir distintos

type PostMeta = {
  id: string;
  title: string;
  created_at: string;
  image_path: string | null;
};

type RatingAgg = { average: number | null; count: number };

export default async function Home() {
  const supabase = publicServerClient;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // Pools globales en paralelo. Hero = mejor puntuado con >=1 voto (cae a reciente
  // si todavía no hay ratings). El resto son los candidatos de cada sección.
  const [trendingRes, topRatedRes, heroRes, recentRes] = await Promise.all([
    supabase.rpc("trending_posts", { days: TRENDING_DAYS, result_limit: POOL_SIZE }),
    supabase.rpc("top_rated_posts", { min_votes: TOP_RATED_MIN_VOTES, result_limit: POOL_SIZE }),
    supabase.rpc("top_rated_posts", { min_votes: 1, result_limit: 1 }),
    supabase
      .from("posts")
      .select("id, title, created_at, image_path")
      .order("created_at", { ascending: false })
      .limit(POOL_SIZE),
  ]);

  const trendingPool = (trendingRes.data ?? []) as { post_id: string; views: number }[];
  const topRatedPool = (topRatedRes.data ?? []) as { post_id: string; avg_score: number; votes: number }[];
  const heroCandidate = (heroRes.data ?? []) as { post_id: string }[];
  const recentPool = (recentRes.data ?? []) as PostMeta[];

  const trendingViewsById = new Map<string, number>();
  for (const row of trendingPool) {
    trendingViewsById.set(row.post_id, Number(row.views) || 0);
  }

  // Historial del usuario: últimos PERSONALIZED_ROWS posts distintos + set de todo
  // lo ya visto (para no recomendar algo que ya leyó).
  const viewedPostIds = new Set<string>();
  let personalizedSources: { xId: string; neighborIds: string[] }[] = [];

  if (user) {
    const { data: views } = await supabase
      .from("content_views")
      .select("post_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(VIEW_HISTORY_SCAN);

    const distinctRecent: string[] = [];
    for (const view of (views ?? []) as { post_id: string }[]) {
      viewedPostIds.add(view.post_id);
      if (!distinctRecent.includes(view.post_id)) {
        distinctRecent.push(view.post_id);
      }
    }

    const lastViewed = distinctRecent.slice(0, PERSONALIZED_ROWS);
    const neighborResults = await Promise.all(
      lastViewed.map((postId) =>
        supabase.rpc("match_related_posts", {
          p_post_id: postId,
          match_threshold: RELATED_THRESHOLD,
          match_count: NEIGHBOR_COUNT,
        }),
      ),
    );

    personalizedSources = lastViewed.map((xId, index) => ({
      xId,
      neighborIds: ((neighborResults[index].data ?? []) as { post_id: string }[]).map((row) => row.post_id),
    }));
  }

  const heroId = heroCandidate[0]?.post_id ?? recentPool[0]?.id ?? null;

  // Reunir todos los ids que necesitan metadata + ratings en una sola pasada.
  const allIds = new Set<string>();
  if (heroId) allIds.add(heroId);
  for (const row of trendingPool) allIds.add(row.post_id);
  for (const row of topRatedPool) allIds.add(row.post_id);
  for (const row of recentPool) allIds.add(row.id);
  for (const source of personalizedSources) {
    allIds.add(source.xId);
    for (const id of source.neighborIds) allIds.add(id);
  }

  const idList = Array.from(allIds);
  const [metaRes, ratingsRes] =
    idList.length === 0
      ? [{ data: [] as PostMeta[] }, { data: [] as { post_id: string; score: number | string }[] }]
      : await Promise.all([
          supabase.from("posts").select("id, title, created_at, image_path").in("id", idList),
          supabase.from("ratings").select("post_id, score").in("post_id", idList),
        ]);

  const metaById = new Map<string, PostMeta>();
  for (const row of (metaRes.data ?? []) as PostMeta[]) {
    metaById.set(row.id, row);
  }

  const ratingByPost = new Map<string, RatingAgg>();
  {
    const sums = new Map<string, { sum: number; count: number }>();
    for (const row of (ratingsRes.data ?? []) as { post_id: string; score: number | string }[]) {
      const score = Number(row.score);
      if (!Number.isFinite(score)) continue;
      const current = sums.get(row.post_id) ?? { sum: 0, count: 0 };
      current.sum += score;
      current.count += 1;
      sums.set(row.post_id, current);
    }
    for (const [postId, { sum, count }] of sums) {
      ratingByPost.set(postId, { average: count > 0 ? sum / count : null, count });
    }
  }

  const imageUrlFor = (path: string | null) =>
    path ? supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl : null;

  const ratingMeta = (id: string): PostCardMeta => {
    const agg = ratingByPost.get(id) ?? { average: null, count: 0 };
    return { kind: "rating", average: agg.average, count: agg.count };
  };

  // Dedup en cascada: cada take() reserva ids no usados (y opcionalmente no vistos).
  const used = new Set<string>();
  const take = (ids: string[], limit: number, excludeViewed = false): PostMeta[] => {
    const picked: PostMeta[] = [];
    for (const id of ids) {
      if (used.has(id)) continue;
      if (excludeViewed && viewedPostIds.has(id)) continue;
      const meta = metaById.get(id);
      if (!meta) continue;
      used.add(id);
      picked.push(meta);
      if (picked.length >= limit) break;
    }
    return picked;
  };

  const heroMeta = heroId ? metaById.get(heroId) ?? null : null;
  if (heroId) used.add(heroId);

  const personalizedSections = personalizedSources
    .map((source) => {
      const xMeta = metaById.get(source.xId);
      const items = take(source.neighborIds, SECTION_SIZE, true);
      return xMeta && items.length > 0 ? { xTitle: xMeta.title, items } : null;
    })
    .filter((section): section is { xTitle: string; items: PostMeta[] } => section !== null);

  const trendingItems = take(
    trendingPool.map((row) => row.post_id),
    SECTION_SIZE,
  );
  const topRatedItems = take(
    topRatedPool.map((row) => row.post_id),
    SECTION_SIZE,
  );
  const recentItems = take(
    recentPool.map((row) => row.id),
    SECTION_SIZE,
  );

  const hasContent = heroMeta !== null;
  const heroRating = heroMeta ? ratingByPost.get(heroMeta.id) : null;

  return (
    <div className="home-scroll-gradient">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
        <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h2 className="mt-4 max-w-2xl text-5xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-6xl">
              Repositorio de Sistemas Inteligentes
            </h2>
            <p className="font-body mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
              Biblioteca de articulos sobre inteligencia artificial: teoria,
              aplicaciones y debate.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-start lg:justify-end">
            <CreatePostCta />
          </div>
        </section>

        {hasContent && heroMeta ? (
          <section className="mt-10">
            <Link href={`/post/${heroMeta.id}`} className="group block">
              <article className="relative isolate overflow-hidden rounded-2xl bg-[var(--surface-low)]">
                <div className="relative aspect-[21/9] w-full">
                  {imageUrlFor(heroMeta.image_path) ? (
                    <Image
                      src={imageUrlFor(heroMeta.image_path) as string}
                      alt={heroMeta.title}
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

                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <p className="inline-flex rounded-md bg-[rgb(64_254_109_/_0.18)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    Post destacado
                  </p>
                  <h3 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
                    {heroMeta.title}
                  </h3>
                  {heroRating && heroRating.count > 0 ? (
                    <div className="mt-3">
                      <RatingSummary
                        average={heroRating.average}
                        count={heroRating.count}
                        starSize={16}
                        textClassName="text-sm font-medium text-[var(--foreground)]"
                        countClassName="text-xs text-[var(--text-muted)]"
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            </Link>
          </section>
        ) : null}

        {hasContent ? (
          <>
            {personalizedSections.map((section, index) => (
              <HomeSection key={`pl-${index}`} title="Porque leíste" subtitle={`«${section.xTitle}»`}>
                {section.items.map((item) => (
                  <PostCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    imageUrl={imageUrlFor(item.image_path)}
                    meta={ratingMeta(item.id)}
                  />
                ))}
              </HomeSection>
            ))}

            {trendingItems.length > 0 ? (
              <HomeSection title="Tendencias">
                {trendingItems.map((item) => (
                  <PostCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    imageUrl={imageUrlFor(item.image_path)}
                    meta={{ kind: "views", count: trendingViewsById.get(item.id) ?? 0 }}
                  />
                ))}
              </HomeSection>
            ) : null}

            {topRatedItems.length > 0 ? (
              <HomeSection title="Mejor puntuados">
                {topRatedItems.map((item) => (
                  <PostCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    imageUrl={imageUrlFor(item.image_path)}
                    meta={ratingMeta(item.id)}
                  />
                ))}
              </HomeSection>
            ) : null}

            {recentItems.length > 0 ? (
              <HomeSection title="Recientes">
                {recentItems.map((item) => (
                  <PostCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    imageUrl={imageUrlFor(item.image_path)}
                    meta={{ kind: "date", date: item.created_at }}
                  />
                ))}
              </HomeSection>
            ) : null}
          </>
        ) : (
          <section className="mt-12 rounded-2xl bg-[var(--surface-low)] p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              Blog
            </p>
            <h3 className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
              Todavia no hay posteos
            </h3>
            <p className="font-body mt-3 max-w-2xl text-[var(--text-muted)]">
              Publica el primer articulo para empezar a construir el
              repositorio de sistemas inteligentes.
            </p>
            <CreatePostCta label="Escribir primer post" className="mt-7 px-5 sm:px-6" />
          </section>
        )}
      </div>
    </div>
  );
}
