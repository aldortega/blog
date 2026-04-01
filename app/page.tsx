import { createClient } from "@/lib/supabase/server";
import { relationText, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import Image from "next/image";
import Link from "next/link";

type HomePost = {
  id: string;
  title: string;
  excerpt: string | null;
  created_at: string;
  image_path: string | null;
  movies: RelationOneOrMany<{ title: string }>;
  profiles: RelationOneOrMany<{ display_name: string | null }>;
};

function formatDate(input: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(input));
}

export default async function Home() {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, excerpt, created_at, image_path, movies(title), profiles(display_name)")
    .order("created_at", { ascending: false });

  const postList = (posts ?? []) as HomePost[];

  const normalizedPosts = postList.map((post) => {
    const imageUrl = post.image_path
      ? supabase.storage.from("post-images").getPublicUrl(post.image_path).data.publicUrl
      : null;

    return {
      ...post,
      imageUrl,
      movieTitle: relationText(post.movies, (movie) => movie.title, "Sin pelicula"),
      author: relationText(post.profiles, (profile) => profile.display_name, "Usuario"),
    };
  });

  const featuredPost = normalizedPosts[0] ?? null;
  const remainingPosts = normalizedPosts.slice(1);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <h2 className="mt-4 max-w-2xl text-5xl font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-6xl">
            Journal
          </h2>
          <p className="font-body mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
            Ensayos de cine, analisis visual y relatos de comunidad en torno al
            cruce entre peliculas e inteligencia artificial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <Link
            href="/nuevo-post"
            className="cta-gradient rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition hover:brightness-105"
          >
            Crear post
          </Link>
          <span className="font-body rounded-xl bg-[var(--surface-high)] px-4 py-2 text-sm text-[var(--text-muted)]">
            {normalizedPosts.length} entradas
          </span>
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
                  Featured Analysis
                </p>
                <h3 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
                  {featuredPost.title}
                </h3>
                <p className="font-body mt-3 max-w-2xl text-sm text-[var(--text-muted)] sm:text-base">
                  {featuredPost.excerpt ??
                    "Lectura destacada de esta semana con foco en imagen, tono y narrativa."}
                </p>
                <p className="font-body mt-4 text-sm text-[var(--text-muted)]">
                  Focus: <span className="text-[var(--foreground)]">{featuredPost.movieTitle}</span> - {" "}
                  {featuredPost.author} - {formatDate(featuredPost.created_at)}
                </p>
              </div>
            </article>
          </Link>
        </section>
      ) : (
        <section className="mt-12 rounded-2xl bg-[var(--surface-low)] p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            Journal
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
            Todavia no hay posteos
          </h3>
          <p className="font-body mt-3 max-w-2xl text-[var(--text-muted)]">
            Publica el primer analisis para empezar a construir el archivo
            editorial del blog.
          </p>
          <Link
            href="/nuevo-post"
            className="cta-gradient mt-7 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)]"
          >
            Escribir primer post
          </Link>
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
                  <p className="font-body mt-4 text-sm text-[var(--text-muted)]">
                    {post.movieTitle} - {post.author}
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
