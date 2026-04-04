import PostOwnerActions from "@/components/post-owner-actions";
import PostAverageRating from "@/components/post-average-rating";
import PostRatingControl from "@/components/post-rating-control";
import CommentDeleteAction from "@/components/comment-delete-action";
import MarkdownRenderer from "@/components/markdown-renderer";
import SubmitButton from "@/components/submit-button";
import ScrollToTopOnMount from "./scroll-to-top-on-mount";
import { canManagePost } from "@/lib/posts/permissions";
import { createClient } from "@/lib/supabase/server";
import { publicServerClient } from "@/lib/supabase/public-server";
import { relationFirst, relationText, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import { fetchTmdbMovieDetails } from "@/lib/tmdb/movie-details";
import { revalidatePath } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PostPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; commentsPage?: string }>;
};

type CommentRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

type RelatedPostRow = {
  id: string;
  title: string;
  created_at: string;
  image_path: string | null;
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
  movies: RelationOneOrMany<{
    tmdb_id: number;
    title: string;
    release_date: string | null;
    overview: string | null;
    director: string | null;
    poster_path: string | null;
  }>;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "No tienes permisos para borrar este post.",
  delete: "No se pudo borrar el post. Intenta nuevamente.",
  comment_unauthorized: "Debes iniciar sesion para comentar.",
  comment_invalid: "El comentario debe tener entre 1 y 1000 caracteres.",
  comment_create: "No se pudo publicar el comentario. Intenta nuevamente.",
  comment_delete_unauthorized: "No tienes permisos para borrar este comentario.",
  comment_delete: "No se pudo borrar el comentario. Intenta nuevamente.",
  rating_unauthorized: "Debes iniciar sesion para puntuar.",
  rating_invalid: "La puntuacion debe estar entre 0.5 y 5.0.",
  rating_save: "No se pudo guardar tu puntuacion. Intenta nuevamente.",
  rating_delete: "No se pudo quitar tu puntuacion. Intenta nuevamente.",
};

const COMMENTS_PAGE_SIZE = 20;
const RELATED_POSTS_FETCH_LIMIT = 12;

function formatRelativeCommentTime(dateString: string): string {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return "hace un momento";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) {
    return "hace un momento";
  }
  if (diffMinutes < 60) {
    return `hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `hace ${diffDays} d`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `hace ${diffWeeks} sem`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `hace ${diffMonths} mes`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `hace ${diffYears} ano`;
}

export default async function PostPage({ params, searchParams }: PostPageProps) {
  const { id } = await params;
  const { error: errorCode, commentsPage } = searchParams ? await searchParams : {};
  const parsedCommentsPage = Number.parseInt(commentsPage ?? "1", 10);
  const currentCommentsPage = Number.isFinite(parsedCommentsPage) && parsedCommentsPage > 0 ? parsedCommentsPage : 1;
  const commentsFrom = (currentCommentsPage - 1) * COMMENTS_PAGE_SIZE;
  const commentsTo = commentsFrom + COMMENTS_PAGE_SIZE - 1;
  const supabase = await createClient();
  const publicSupabase = publicServerClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, author_id, title, content, created_at, image_path, movies(tmdb_id, title, release_date, overview, director, poster_path), profiles(display_name, avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const postRow = post as PostRow;

  const [
    { data: viewerProfile },
    { data: comments },
    { count: commentsCount },
    { data: postRatings },
    { data: viewerRatingRow },
    { data: relatedPosts },
  ] =
    await Promise.all([
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("comments")
      .select("id, author_id, content, created_at, profiles(display_name, avatar_url)")
      .eq("post_id", id)
      .order("created_at", { ascending: false })
      .range(commentsFrom, commentsTo),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id),
    publicSupabase
      .from("ratings")
      .select("post_id, score")
      .eq("post_id", id),
    user
      ? supabase.from("ratings").select("score").eq("post_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("posts")
      .select("id, title, created_at, image_path")
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(RELATED_POSTS_FETCH_LIMIT),
  ]);

  const viewerRole = typeof viewerProfile?.role === "string" ? viewerProfile.role : null;
  const canManage = canManagePost({
    viewerId: user?.id ?? null,
    viewerRole,
    postAuthorId: postRow.author_id,
  });
  const commentList = (comments ?? []) as CommentRow[];
  const totalComments = commentsCount ?? 0;
  const totalCommentPages = Math.max(1, Math.ceil(totalComments / COMMENTS_PAGE_SIZE));
  const hasPreviousCommentsPage = currentCommentsPage > 1;
  const hasNextCommentsPage = currentCommentsPage < totalCommentPages;
  const postRatingRows = (postRatings ?? []) as RatingRow[];
  const postScores = postRatingRows
    .map((rating) => Number(rating.score))
    .filter((score) => Number.isFinite(score));
  const totalRatings = postScores.length;
  const avgRating = totalRatings > 0 ? postScores.reduce((sum, score) => sum + score, 0) / totalRatings : null;
  const viewerRating = viewerRatingRow?.score ?? null;
  const normalizedViewerRating = viewerRating === null ? null : Number(viewerRating);
  const relatedPostRows = (relatedPosts ?? []) as RelatedPostRow[];
  const relatedPostIds = relatedPostRows.map((postItem) => postItem.id);
  const relatedRatingsAggregateQuery =
    relatedPostIds.length === 0
      ? Promise.resolve({ data: [] as RatingRow[] })
      : publicSupabase
          .from("ratings")
          .select("post_id, score")
          .in("post_id", relatedPostIds);
  const { data: relatedRatingAggregates } = await relatedRatingsAggregateQuery;
  const relatedRatingRows = (relatedRatingAggregates ?? []) as RatingRow[];
  const ratingByRelatedPost = new Map<
    string,
    {
      ratingsCount: number;
      scoreSum: number;
    }
  >();

  for (const rating of relatedRatingRows) {
    const score = Number(rating.score);
    if (!Number.isFinite(score)) {
      continue;
    }
    const current = ratingByRelatedPost.get(rating.post_id) ?? { ratingsCount: 0, scoreSum: 0 };
    current.ratingsCount += 1;
    current.scoreSum += score;
    ratingByRelatedPost.set(rating.post_id, current);
  }

  const featuredCollectionPosts = relatedPostRows
    .map((item) => {
      const rating = ratingByRelatedPost.get(item.id);
      const ratingsCount = rating?.ratingsCount ?? 0;
      const averageRating = rating && rating.ratingsCount > 0 ? rating.scoreSum / rating.ratingsCount : null;
      const imageUrl = item.image_path
        ? supabase.storage.from("post-images").getPublicUrl(item.image_path).data.publicUrl
        : null;

      return {
        ...item,
        ratingsCount,
        averageRating,
        imageUrl,
      };
    })
    .sort((a, b) => {
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
    })
    .slice(0, 3);

  const imageUrl = postRow.image_path
    ? supabase.storage.from("post-images").getPublicUrl(postRow.image_path).data.publicUrl
    : null;

  const formattedDate = new Date(postRow.created_at).toLocaleDateString("es-AR", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  const authorName = relationText(postRow.profiles, (profile) => profile.display_name, "ALEXANDER STERLING");
  const authorAvatar =
    relationText(postRow.profiles, (profile) => profile.avatar_url, "") ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=101418&color=e0e3e8`;
  const movie = relationFirst(postRow.movies);

  const needsTmdbFallback = Boolean(
    movie &&
    movie.tmdb_id &&
    (!movie.poster_path || !movie.director || !movie.overview || !movie.release_date),
  );
  const fallbackMovie = needsTmdbFallback ? await fetchTmdbMovieDetails(movie!.tmdb_id) : null;

  const movieTitle = movie?.title ?? fallbackMovie?.title ?? "Pelicula sin titulo";
  const movieYear =
    movie?.release_date?.substring(0, 4) ?? fallbackMovie?.releaseDate?.substring(0, 4) ?? "----";
  const movieDirector = movie?.director ?? fallbackMovie?.director ?? "Director desconocido";
  const movieOverview =
    movie?.overview ?? fallbackMovie?.overview ?? "Sin descripcion disponible para esta pelicula.";
  const moviePosterPath = movie?.poster_path ?? fallbackMovie?.posterPath ?? null;
  const moviePosterUrl = moviePosterPath ? `https://image.tmdb.org/t/p/w780${moviePosterPath}` : null;
  const commentsPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (errorCode) {
      params.set("error", errorCode);
    }
    if (page > 1) {
      params.set("commentsPage", String(page));
    }
    const query = params.toString();
    return query.length > 0 ? `/post/${id}?${query}` : `/post/${id}`;
  };

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
    const isAllowed = canManagePost({
      viewerId: actionUser.id,
      viewerRole: actionRole,
      postAuthorId: targetPost.author_id,
    });

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

  async function createComment(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=comment_unauthorized`);
    }

    const content = String(formData.get("content") ?? "").trim();
    if (!content || content.length > 1000) {
      redirect(`/post/${id}?error=comment_invalid`);
    }

    const { error: commentError } = await supabaseServer.from("comments").insert({
      post_id: id,
      author_id: actionUser.id,
      content,
    });

    if (commentError) {
      redirect(`/post/${id}?error=comment_create`);
    }

    revalidatePath(`/post/${id}`);
  }

  async function deleteComment(formData: FormData) {
    "use server";

    const commentId = String(formData.get("comment_id") ?? "").trim();
    if (!commentId) {
      redirect(`/post/${id}?error=comment_delete`);
    }

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=comment_delete_unauthorized`);
    }

    const [{ data: targetComment }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("comments").select("id, author_id").eq("id", commentId).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetComment) {
      redirect(`/post/${id}?error=comment_delete`);
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const canDeleteComment = actionUser.id === targetComment.author_id || actionRole === "admin";
    if (!canDeleteComment) {
      redirect(`/post/${id}?error=comment_delete_unauthorized`);
    }

    const { error: deleteCommentError } = await supabaseServer
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (deleteCommentError) {
      redirect(`/post/${id}?error=comment_delete`);
    }

    revalidatePath(`/post/${id}`);
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
            {/* Cinematic Gradient Mask */}
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
              {canManage ? <PostOwnerActions postId={id} onDelete={deletePost} /> : null}

            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-20 py-12 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-16 lg:gap-24">
        {/* Left Column - Content */}
        <div className="min-w-0">
          <MarkdownRenderer content={postRow.content} className="mt-10 max-w-3xl" />

          {/* Comments Section */}
          <section className="mt-24 pt-12 border-t border-[#3c4b3a]/30">
            <div className="mb-10">
              <PostRatingControl
                isAuthenticated={Boolean(user)}
                initialRating={normalizedViewerRating}
                onRate={upsertRating}
              />
            </div>
            <h3 className="text-xl font-sans font-bold text-white mb-8 tracking-wide uppercase">
              Comentarios ({totalComments})
            </h3>

            <div className="space-y-6">
              {commentList.length === 0 ? (
                <div className="rounded-xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-5 text-sm text-[#bacbb6]">
                  Todavia no hay comentarios. Se la primera persona en comentar.
                </div>
              ) : (
                commentList.map((comment) => (
                  <div key={comment.id} className="group bg-[#181c20] rounded-xl p-6 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#262a2f] flex-shrink-0 overflow-hidden border border-[#3c4b3a]/30 relative">
                      <Image
                        src={
                          relationText(comment.profiles, (profile) => profile.avatar_url, "") ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            relationText(comment.profiles, (profile) => profile.display_name, "Usuario"),
                          )}&background=262a2f&color=e0e3e8`
                        }
                        alt={relationText(comment.profiles, (profile) => profile.display_name, "Usuario")}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center">
                          <span className="font-bold text-white text-sm">
                            {relationText(comment.profiles, (profile) => profile.display_name, "Usuario")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[#bacbb6] text-[10px] uppercase tracking-widest"
                          >
                            {formatRelativeCommentTime(comment.created_at)}
                          </span>
                          {user && (comment.author_id === user.id || viewerRole === "admin") ? (
                            <CommentDeleteAction
                              commentId={comment.id}
                              onDelete={deleteComment}
                              className="md:opacity-0 md:group-hover:opacity-100 md:pointer-events-none md:group-hover:pointer-events-auto"
                            />
                          ) : null}
                        </div>
                      </div>
                      <p className="text-[#bacbb6] text-sm leading-relaxed">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {totalCommentPages > 1 ? (
              <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-[#3c4b3a]/20 bg-[#0b0f12] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[#bacbb6]">
                <span>
                  Pagina {currentCommentsPage} de {totalCommentPages}
                </span>
                <div className="flex items-center gap-2">
                  {hasPreviousCommentsPage ? (
                    <Link
                      href={commentsPageHref(currentCommentsPage - 1)}
                      className="rounded-md border border-[#3c4b3a]/35 px-3 py-1.5 text-[#e0e3e8] transition hover:border-[#40fe6d]/60 hover:text-[#40fe6d]"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {hasNextCommentsPage ? (
                    <Link
                      href={commentsPageHref(currentCommentsPage + 1)}
                      className="rounded-md border border-[#3c4b3a]/35 px-3 py-1.5 text-[#e0e3e8] transition hover:border-[#40fe6d]/60 hover:text-[#40fe6d]"
                    >
                      Siguiente
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Comment Input */}
            {user ? (
              <form
                action={createComment}
                className="mt-8 bg-[#0b0f12] rounded-xl p-4 border border-[#3c4b3a]/30 focus-within:border-[#40fe6d] transition-colors"
              >
                <textarea
                  name="content"
                  required
                  maxLength={1000}
                  placeholder="Comparte tu reflexion..."
                  className="w-full bg-transparent text-[#e0e3e8] placeholder:text-[#bacbb6]/50 outline-none resize-none min-h-[100px] text-sm font-body"
                />
                <div className="flex justify-end mt-2">
                  <SubmitButton
                    idleLabel="Publicar"
                    pendingLabel="Publicando..."
                    className="bg-[#40fe6d] text-[#00390f] px-6 py-2 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#00e054] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </form>
            ) : (
              <div className="mt-8 rounded-xl border border-[#3c4b3a]/30 bg-[#0b0f12] px-5 py-4 text-sm text-[#bacbb6]">
                Inicia sesion con Google para publicar comentarios.
              </div>
            )}
          </section>
        </div>

        {/* Right Column - Sidebar */}
        <aside className="space-y-12">
          {/* Film Context Card */}
          <div className="bg-[#181c20] rounded-2xl overflow-hidden flex flex-col border border-[#181c20]">
            <div className="relative w-full aspect-[2/3] bg-[#0b0f12]">
              {moviePosterUrl ? (
                <Image
                  src={moviePosterUrl}
                  alt={movieTitle}
                  fill
                  sizes="(max-width: 1024px) 100vw, 380px"
                  quality={85}
                  className="object-contain opacity-95"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-tr from-[#101418] to-[#181c20]" />
              )}
              {/* Overlay gradient for poster mask */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#181c20] via-[#181c20]/30 to-transparent" />
            </div>
            <div className="p-8 pt-0 -mt-4 relative z-10">
              <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div>
                  <span className="block text-[#bacbb6] text-[10px] tracking-widest uppercase mb-1">Año</span>
                  <span className="text-white font-bold">{movieYear}</span>
                </div>
                <div>
                  <span className="block text-[#bacbb6] text-[10px] tracking-widest uppercase mb-1">Director</span>
                  <span className="text-white font-bold">{movieDirector}</span>
                </div>
              </div>
              <p className="text-[#bacbb6] text-sm leading-relaxed">{movieOverview}</p>


            </div>
          </div>

          {/* Coleccion destacada */}
          {featuredCollectionPosts.length > 0 ? (
            <div>
              <span className="text-[#bacbb6] text-[10px] font-bold tracking-widest uppercase mb-6 block">Coleccion destacada</span>
              <div className="space-y-4">
                {featuredCollectionPosts.map((relatedPost) => {
                  const relatedYear = new Date(relatedPost.created_at).getFullYear();
                  const yearLabel = Number.isFinite(relatedYear) ? String(relatedYear) : "----";

                  return (
                    <Link
                      key={relatedPost.id}
                      href={`/post/${relatedPost.id}`}
                      className="flex items-center gap-4 group"
                    >
                      <div className="relative w-32 h-32 bg-[#181c20] rounded-xl overflow-hidden border border-[#3c4b3a]/30 group-hover:border-[#40fe6d]/50 transition-colors shrink-0">
                        {relatedPost.imageUrl ? (
                          <Image
                            src={relatedPost.imageUrl}
                            alt={relatedPost.title}
                            fill
                            sizes="200px"
                            quality={80}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center px-1">
                            <span className="text-[#bacbb6] text-[8px] uppercase tracking-widest leading-none mb-1">{yearLabel}</span>
                            <span className="text-white font-bold leading-none text-[8px] uppercase tracking-widest text-center line-clamp-2">
                              {relatedPost.title}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-white font-bold font-sans text-sm group-hover:text-[#40fe6d] transition-colors line-clamp-2">
                          {relatedPost.title}
                        </h4>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
