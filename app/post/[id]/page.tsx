import PostOwnerActions from "@/components/post-owner-actions";
import PostAverageRating from "@/components/post-average-rating";
import PostRatingControl from "@/components/post-rating-control";
import MarkdownRenderer from "@/components/markdown-renderer";
import PostCard from "@/components/post-card";
import ScrollToTopOnMount from "./scroll-to-top-on-mount";
import SummaryStatusSync from "./summary-status-sync";
import RegenerateSummaryButton from "./regenerate-summary-button";
import RegenerateEmbeddingsButton from "./regenerate-embeddings-button";
import EmbeddingsStatusSync from "./embeddings-status-sync";
import SummaryGeneratingTitle from "./summary-generating-title";
import { canManageContent } from "@/lib/posts/permissions";
import { createClient } from "@/lib/supabase/server";
import { publicServerClient } from "@/lib/supabase/public-server";
import { relationText, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import { generatePostSummary } from "@/lib/ai/generate-post-summary";
import { generatePostEmbeddings } from "@/lib/ai/embeddings";
import { resolveAvatarSrc } from "@/lib/avatar";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles, Eye, MessagesSquare, Plus } from "lucide-react";

type PostPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
};

type RelatedPostRow = {
  id: string;
  title: string;
  created_at: string;
  image_path: string | null;
};

type RelatedMatchRow = {
  post_id: string;
  similarity: number;
};

type RatingRow = {
  post_id: string;
  score: number | string;
};

type PostRow = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
  image_path: string | null;
  ai_summary: string | null;
  ai_summary_status: "pending" | "generating" | "ready" | "failed";
  ai_summary_attempts: number;
  ai_summary_generated_at: string | null;
  embeddings_status: "pending" | "generating" | "ready" | "failed";
  chunks_count: number;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "No tienes permisos para borrar este post.",
  delete: "No se pudo borrar el post. Intenta nuevamente.",
  rating_unauthorized: "Debes iniciar sesion para puntuar.",
  rating_invalid: "La puntuacion debe estar entre 0.5 y 5.0.",
  rating_save: "No se pudo guardar tu puntuacion. Intenta nuevamente.",
  rating_delete: "No se pudo quitar tu puntuacion. Intenta nuevamente.",
  summary_regenerate: "No se pudo regenerar el resumen. Intenta nuevamente.",
  embeddings_regenerate: "No se pudo regenerar los embeddings. Intenta nuevamente.",
};

// Relacionados semánticos: mismo umbral coseno que /api/search.
const RELATED_SIMILARITY_THRESHOLD = 0.7;
const RELATED_MATCH_COUNT = 4;

export default async function PostPage({ params, searchParams }: PostPageProps) {
  const { id } = await params;
  const { error: errorCode } = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const publicSupabase = publicServerClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch post and global settings in parallel
  const [postRes, settingRes] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, author_id, title, content, created_at, image_path, ai_summary, ai_summary_status, ai_summary_attempts, ai_summary_generated_at, embeddings_status, chunks_count, profiles(display_name, avatar_url)",
      )
      .eq("id", id)
      .maybeSingle(),
    publicSupabase
      .from("site_settings")
      .select("value")
      .eq("key", "disable_ai")
      .maybeSingle(),
  ]);

  const post = postRes.data;
  const isAiDisabled = settingRes.data?.value === true;

  if (!post) {
    notFound();
  }

  const postRow = post as PostRow;
  const hasSummary = typeof postRow.ai_summary === "string" && postRow.ai_summary.trim().length > 0;
  const showPendingSummary = postRow.ai_summary_status === "pending" || postRow.ai_summary_status === "generating";
  const showFailedSummary =
    postRow.ai_summary_status === "failed" || (postRow.ai_summary_status === "ready" && !hasSummary);
  const embeddingsStatus = postRow.embeddings_status;
  const chunksCount = postRow.chunks_count ?? 0;
  const embeddingsIndexing = embeddingsStatus === "pending" || embeddingsStatus === "generating";

  const [
    { data: viewerProfile },
    { count: viewsCount },
    { data: postRatings },
    { data: viewerRatingRow },
  ] =
    await Promise.all([
      user
        ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      publicSupabase
        .from("content_views")
        .select("id", { count: "exact", head: true })
        .eq("post_id", id),
      publicSupabase
        .from("ratings")
        .select("post_id, score")
        .eq("post_id", id),
      user
        ? supabase.from("ratings").select("score").eq("post_id", id).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const viewerRole = typeof viewerProfile?.role === "string" ? viewerProfile.role : null;
  const canManage = canManageContent(viewerRole);
  const totalViews = viewsCount ?? 0;

  // Registramos la apertura del post fuera del render (logueado o anónimo). La RLS
  // permite el insert con user_id null o igual al usuario actual.
  after(async () => {
    await supabase.from("content_views").insert({
      post_id: id,
      user_id: user?.id ?? null,
    });
  });

  const postRatingRows = (postRatings ?? []) as RatingRow[];
  const postScores = postRatingRows
    .map((rating) => Number(rating.score))
    .filter((score) => Number.isFinite(score));
  const totalRatings = postScores.length;
  const avgRating = totalRatings > 0 ? postScores.reduce((sum, score) => sum + score, 0) / totalRatings : null;
  const viewerRating = viewerRatingRow?.score ?? null;
  const normalizedViewerRating = viewerRating === null ? null : Number(viewerRating);
  // Artículos relacionados por similitud semántica (max-sim entre chunks vía
  // pgvector). Solo semánticos: si el post no tiene embeddings o nada supera el
  // umbral, el bloque queda vacío y no se muestra.
  const relatedMatchRows = isAiDisabled
    ? []
    : ((
      await publicSupabase.rpc("match_related_posts", {
        p_post_id: id,
        match_threshold: RELATED_SIMILARITY_THRESHOLD,
        match_count: RELATED_MATCH_COUNT,
      })
    ).data ?? []) as RelatedMatchRow[];
  const relatedMatchIds = relatedMatchRows.map((match) => match.post_id);

  const { data: relatedPosts } =
    relatedMatchIds.length === 0
      ? { data: [] as RelatedPostRow[] }
      : await publicSupabase.from("posts").select("id, title, created_at, image_path").in("id", relatedMatchIds);
  const relatedPostById = new Map<string, RelatedPostRow>();
  for (const postItem of (relatedPosts ?? []) as RelatedPostRow[]) {
    relatedPostById.set(postItem.id, postItem);
  }

  // Preserva el orden por similitud que devolvió la RPC.
  const featuredCollectionPosts = relatedMatchRows
    .map((match) => {
      const item = relatedPostById.get(match.post_id);
      if (!item) {
        return null;
      }
      const imageUrl = item.image_path
        ? supabase.storage.from("post-images").getPublicUrl(item.image_path).data.publicUrl
        : null;
      return { ...item, imageUrl };
    })
    .filter((item): item is RelatedPostRow & { imageUrl: string | null } => item !== null);

  // Debates relacionados: hilos del foro vinculados a este artículo (top por score).
  const { data: relatedThreads } = await publicSupabase
    .from("forum_threads")
    .select("id, title, reply_count, score")
    .eq("content_id", id)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  const relatedThreadList = (relatedThreads ?? []) as {
    id: string;
    title: string;
    reply_count: number;
    score: number;
  }[];

  const imageUrl = postRow.image_path
    ? supabase.storage.from("post-images").getPublicUrl(postRow.image_path).data.publicUrl
    : null;

  const formattedDate = new Date(postRow.created_at).toLocaleDateString("es-AR", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  const authorName = relationText(postRow.profiles, (profile) => profile.display_name, "ALEXANDER STERLING");
  const authorAvatar = resolveAvatarSrc(
    relationText(postRow.profiles, (profile) => profile.avatar_url, ""),
    authorName,
    { background: "101418", color: "e0e3e8" },
  );


  async function deletePost() {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const [{ data: targetPost }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("posts").select("author_id, image_path").eq("id", id).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetPost) {
      redirect("/");
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const isAllowed = canManageContent(actionRole);

    if (!isAllowed) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const { error: deleteError } = await supabaseServer.from("posts").delete().eq("id", id);

    if (deleteError) {
      redirect(`/post/${id}?error=delete`);
    }

    if (targetPost.image_path) {
      await supabaseServer.storage.from("post-images").remove([targetPost.image_path]);
    }

    revalidatePath("/");
    revalidatePath(`/post/${id}`);
    redirect("/");
  }



  async function upsertRating(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=rating_unauthorized`);
    }

    const rawScore = Number.parseFloat(String(formData.get("score") ?? "0").replace(",", "."));
    const isValidScore =
      Number.isFinite(rawScore) &&
      rawScore >= 0.5 &&
      rawScore <= 5 &&
      Number.isInteger(rawScore * 2);

    if (!isValidScore) {
      redirect(`/post/${id}?error=rating_invalid`);
    }

    const { error: ratingError } = await supabaseServer
      .from("ratings")
      .upsert(
        {
          post_id: id,
          user_id: actionUser.id,
          score: rawScore,
        },
        { onConflict: "post_id,user_id" },
      );

    if (ratingError) {
      redirect(`/post/${id}?error=rating_save`);
    }

    revalidatePath("/");
    revalidatePath(`/post/${id}`);
  }

  async function regenerateSummary() {
    "use server";

    const supabaseServer = await createClient();
    const { data: settingData } = await supabaseServer
      .from("site_settings")
      .select("value")
      .eq("key", "disable_ai")
      .maybeSingle();

    if (settingData?.value === true) {
      redirect(`/post/${id}?error=summary_regenerate`);
    }

    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const [{ data: targetPost }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("posts").select("author_id, title, content").eq("id", id).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetPost) {
      redirect("/");
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const isAllowed = canManageContent(actionRole);

    if (!isAllowed) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const { error: resetError } = await supabaseServer
      .from("posts")
      .update({
        ai_summary: null,
        ai_summary_status: "pending",
        ai_summary_attempts: 0,
        ai_summary_generated_at: null,
      })
      .eq("id", id);

    if (resetError) {
      redirect(`/post/${id}?error=summary_regenerate`);
    }

    after(async () => {
      await generatePostSummary({
        supabase: supabaseServer,
        postId: id,
        title: targetPost.title,
        content: targetPost.content,
      });
      revalidatePath(`/post/${id}`);
    });

    revalidatePath(`/post/${id}`);
    redirect(`/post/${id}`);
  }

  async function regenerateEmbeddings() {
    "use server";

    const supabaseServer = await createClient();
    const { data: settingData } = await supabaseServer
      .from("site_settings")
      .select("value")
      .eq("key", "disable_ai")
      .maybeSingle();

    if (settingData?.value === true) {
      redirect(`/post/${id}?error=embeddings_regenerate`);
    }

    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const [{ data: targetPost }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("posts").select("title, content").eq("id", id).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetPost) {
      redirect("/");
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;

    if (!canManageContent(actionRole)) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const { error: resetError } = await supabaseServer
      .from("posts")
      .update({
        embeddings_status: "pending",
        embeddings_attempts: 0,
        embeddings_generated_at: null,
      })
      .eq("id", id);

    if (resetError) {
      redirect(`/post/${id}?error=embeddings_regenerate`);
    }

    after(async () => {
      await generatePostEmbeddings({
        supabase: supabaseServer,
        postId: id,
        title: targetPost.title,
        content: targetPost.content,
        force: true,
      });
      revalidatePath(`/post/${id}`);
    });

    revalidatePath(`/post/${id}`);
    redirect(`/post/${id}`);
  }

  return (
    <div className="min-h-screen bg-[#101418] text-[#e0e3e8] font-body selection:bg-[#40fe6d]/30 pb-20">
      <ScrollToTopOnMount />
      {/* Hero Section */}
      <div className="relative w-full h-[70vh] min-h-[600px] flex flex-col justify-end pb-16 px-6 lg:px-20 overflow-hidden">
        {imageUrl ? (
          <div className="absolute inset-0 z-0">
            <Image
              src={imageUrl}
              alt={postRow.title}
              fill
              className="object-cover object-top opacity-80"
              priority
            />
            {/* Gradient Mask */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#101418] via-[#101418]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#101418]/90 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#181c20] via-[#101418] to-[#101418]"></div>
        )}

        <div className="relative z-10 max-w-5xl">
          {errorCode ? (
            <p className="mb-6 inline-flex rounded border border-rose-900/50 bg-rose-950/40 px-4 py-2 text-xs font-semibold text-rose-300">
              {ERROR_MESSAGES[errorCode] ?? "Ocurrio un error durante la accion."}
            </p>
          ) : null}

          <div className="mb-6">

          </div>
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold leading-[1.05] tracking-tight text-white mb-8 font-sans">
            {postRow.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm font-bold tracking-wide">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#181c20] overflow-hidden border border-[#3c4b3a]/30 relative">
                  <Image
                    src={authorAvatar}
                    alt={authorName}
                    fill
                    sizes="40px"
                    className="object-cover"
                    quality={100}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-white">{authorName}</span>
                  <span className="text-[#bacbb6] text-xs uppercase tracking-widest">{formattedDate}</span>
                </div>
              </div>

              <PostAverageRating
                initialAverage={avgRating}
                initialCount={totalRatings}
                initialViewerRating={normalizedViewerRating}
                textClassName="text-sm font-semibold text-white"
              />
              <div className="flex items-center gap-4 text-sm font-semibold text-[#bacbb6]">
                <span className="inline-flex items-center gap-1.5" title="Vistas">
                  <Eye className="h-4 w-4" />
                  {totalViews.toLocaleString("es-AR")}
                </span>
              </div>
              {canManage ? <PostOwnerActions postId={id} onDelete={deletePost} /> : null}

            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-20 py-12 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-16 lg:gap-24">
        {/* Left Column - Content */}
        <div className="min-w-0">
          {showPendingSummary && !isAiDisabled ? (
            <section className="rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-5">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#40fe6d]">
                <Sparkles className="h-4 w-4" />
                <SummaryGeneratingTitle />
              </p>
              <SummaryStatusSync postId={id} initialStatus={postRow.ai_summary_status} />
            </section>
          ) : null}
          {postRow.ai_summary_status === "ready" && hasSummary && !isAiDisabled ? (
            <section className="rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#40fe6d]">
                  <Sparkles className="h-4 w-4" />
                  Resumen

                </p>
                {canManage ? (
                  <form action={regenerateSummary}>
                    <RegenerateSummaryButton className="text-[#bacbb6] transition hover:text-[#40fe6d] disabled:opacity-70" />
                  </form>
                ) : null}
              </div>
              <MarkdownRenderer content={postRow.ai_summary ?? ""} compact className="mt-3" />
            </section>
          ) : null}
          {showFailedSummary && !isAiDisabled ? (
            <section className="rounded-2xl border border-rose-900/40 bg-rose-950/20 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-rose-300">
                  <Sparkles className="h-4 w-4" />
                  Resumen
                </p>
                {canManage ? (
                  <form action={regenerateSummary}>
                    <RegenerateSummaryButton className="text-rose-200 transition hover:text-rose-100 disabled:opacity-70" />
                  </form>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-rose-200/90">
                No se pudo generar el resumen para este post.
              </p>
            </section>
          ) : null}

          {canManage && !isAiDisabled ? (
            <section className="mt-4 rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#40fe6d]">
                    <Sparkles className="h-4 w-4" />
                    Búsqueda semántica (RAG)
                  </p>
                  <p className="mt-1 text-xs text-[#bacbb6]">
                    {embeddingsIndexing
                      ? "Indexando el contenido..."
                      : embeddingsStatus === "ready" && chunksCount > 0
                        ? `Indexado · ${chunksCount} ${chunksCount === 1 ? "fragmento" : "fragmentos"}`
                        : embeddingsStatus === "ready"
                          ? "Sin fragmentos para indexar."
                          : "Sin indexar. Regenera para incluirlo en la búsqueda y los relacionados."}
                  </p>
                </div>
                {!embeddingsIndexing ? (
                  <form action={regenerateEmbeddings}>
                    <RegenerateEmbeddingsButton
                      className={
                        embeddingsStatus === "failed"
                          ? "text-rose-200 transition hover:text-rose-100 disabled:opacity-70"
                          : "text-[#bacbb6] transition hover:text-[#40fe6d] disabled:opacity-70"
                      }
                    />
                  </form>
                ) : null}
              </div>
              {embeddingsIndexing ? (
                <EmbeddingsStatusSync postId={id} initialStatus={embeddingsStatus} />
              ) : null}
            </section>
          ) : null}

          <MarkdownRenderer content={postRow.content} className="mt-10 max-w-3xl" />

          {/* Rating Section */}
          <section className="mt-24 pt-12 border-t border-[#3c4b3a]/30">
            <div className="max-w-3xl">
              <PostRatingControl
                isAuthenticated={Boolean(user)}
                initialRating={normalizedViewerRating}
                onRate={upsertRating}
              />
            </div>
          </section>
        </div>

        {/* Right Column - Sidebar */}
        <aside className="space-y-12">
          {/* Articulos relacionados (similitud semantica) */}
          {featuredCollectionPosts.length > 0 ? (
            <div>
              <span className="text-[#bacbb6] text-[10px] font-bold tracking-widest uppercase mb-6 block">Articulos relacionados</span>
              <div className="space-y-4">
                {featuredCollectionPosts.map((relatedPost) => (
                  <PostCard
                    key={relatedPost.id}
                    id={relatedPost.id}
                    title={relatedPost.title}
                    imageUrl={relatedPost.imageUrl}
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Debates relacionados (foro) */}
          <div>
            <span className="mb-6 block text-[10px] font-bold uppercase tracking-widest text-[#bacbb6]">
              Debates relacionados
            </span>
            {relatedThreadList.length > 0 ? (
              <div className="space-y-3">
                {relatedThreadList.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/foro/${thread.id}`}
                    className="group block rounded-xl border border-[#3c4b3a]/30 bg-[#181c20] p-4 transition-colors hover:border-[#40fe6d]/40"
                  >
                    <h4 className="line-clamp-2 text-sm font-bold text-white transition-colors group-hover:text-[#40fe6d]">
                      {thread.title}
                    </h4>
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold text-[#bacbb6]">
                      <span className="inline-flex items-center gap-1">
                        <MessagesSquare className="h-3.5 w-3.5" />
                        {thread.reply_count.toLocaleString("es-AR")}
                      </span>
                      <span>{thread.score.toLocaleString("es-AR")} pts</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-[#bacbb6]/70">
                Todavía no hay debates sobre este artículo.
              </p>
            )}
            <Link
              href={`/foro/nuevo?content=${id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#40fe6d]/40 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#40fe6d] transition-colors hover:bg-[#40fe6d]/10"
            >
              <Plus size={14} />
              Abrir debate
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
