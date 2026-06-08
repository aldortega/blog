import { createClient } from "@/lib/supabase/server";
import { publicServerClient } from "@/lib/supabase/public-server";
import { relationFirst, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import { resolveAvatarSrc } from "@/lib/avatar";
import { canManageContent } from "@/lib/posts/permissions";
import { buildReplyTree, flattenReplyTree } from "@/lib/forum/tree";
import MarkdownRenderer from "@/components/markdown-renderer";
import ForumVoteControl from "@/components/forum/forum-vote-control";
import ForumReplyForm from "@/components/forum/forum-reply-form";
import ForumDeleteAction from "@/components/forum/forum-delete-action";
import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { CornerDownRight, FileText, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

const MAX_VISUAL_DEPTH = 4;
const MAX_REPLY_LENGTH = 2000;

type ThreadRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  image_path: string | null;
  score: number;
  reply_count: number;
  created_at: string;
  content_id: string | null;
  categories: RelationOneOrMany<{ name: string | null; slug: string | null }>;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

type ReplyRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  score: number;
  is_deleted: boolean;
  created_at: string;
  profiles: RelationOneOrMany<{ display_name: string | null; avatar_url: string | null }>;
};

type ThreadPageProps = {
  params: Promise<{ threadId: string }>;
  searchParams?: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  reply_unauthorized: "Debes iniciar sesión para responder.",
  reply_invalid: "La respuesta debe tener entre 1 y 2000 caracteres.",
  reply_create: "No se pudo publicar la respuesta. Intenta nuevamente.",
  reply_delete_unauthorized: "No tienes permisos para borrar esta respuesta.",
  reply_delete: "No se pudo borrar la respuesta. Intenta nuevamente.",
  thread_delete_unauthorized: "No tienes permisos para borrar este hilo.",
  thread_delete: "No se pudo borrar el hilo. Intenta nuevamente.",
};

const numberFormatter = new Intl.NumberFormat("es-AR");

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

export async function generateMetadata({ params }: ThreadPageProps): Promise<Metadata> {
  const { threadId } = await params;
  const { data } = await publicServerClient
    .from("forum_threads")
    .select("title")
    .eq("id", threadId)
    .maybeSingle();
  if (!data) {
    return { title: "Hilo no encontrado" };
  }
  return { title: `${data.title} — Foro` };
}

export default async function ThreadPage({ params, searchParams }: ThreadPageProps) {
  const { threadId } = await params;
  const { error: errorCode } = searchParams ? await searchParams : {};

  const supabase = await createClient();
  const supabasePublic = publicServerClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: thread } = await supabasePublic
    .from("forum_threads")
    .select(
      "id, author_id, title, body, image_path, score, reply_count, created_at, content_id, categories(name, slug), profiles(display_name, avatar_url)",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    notFound();
  }

  const threadRow = thread as ThreadRow;

  const [{ data: replies }, { data: viewerProfile }, { data: linkedPost }] = await Promise.all([
    supabasePublic
      .from("forum_posts")
      .select("id, author_id, parent_id, body, score, is_deleted, created_at, profiles(display_name, avatar_url)")
      .eq("thread_id", threadId),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    threadRow.content_id
      ? supabasePublic.from("posts").select("id, title").eq("id", threadRow.content_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const replyRows = (replies ?? []) as ReplyRow[];
  const viewerRole = typeof viewerProfile?.role === "string" ? viewerProfile.role : null;
  const isAdmin = canManageContent(viewerRole);

  // Votos del usuario actual (hilo + respuestas) para inicializar los controles.
  let threadUserValue = 0;
  const replyVoteMap = new Map<string, number>();
  if (user) {
    const replyIds = replyRows.map((reply) => reply.id);
    const [{ data: threadVote }, { data: replyVotes }] = await Promise.all([
      supabase
        .from("forum_votes")
        .select("value")
        .eq("user_id", user.id)
        .eq("target_type", "thread")
        .eq("target_id", threadId)
        .maybeSingle(),
      replyIds.length > 0
        ? supabase
            .from("forum_votes")
            .select("target_id, value")
            .eq("user_id", user.id)
            .eq("target_type", "post")
            .in("target_id", replyIds)
        : Promise.resolve({ data: [] as { target_id: string; value: number }[] }),
    ]);
    threadUserValue = threadVote?.value ?? 0;
    for (const vote of (replyVotes ?? []) as { target_id: string; value: number }[]) {
      replyVoteMap.set(vote.target_id, vote.value);
    }
  }

  // Mapa id → nombre de autor (para el "En respuesta a @user" del aplanado).
  const authorNameById = new Map<string, string>();
  for (const reply of replyRows) {
    const author = relationFirst(reply.profiles);
    authorNameById.set(reply.id, author?.display_name?.trim() || "Usuario");
  }

  const tree = buildReplyTree(replyRows);
  const orderedReplies = flattenReplyTree(tree);

  const category = relationFirst(threadRow.categories);
  const threadAuthor = relationFirst(threadRow.profiles);
  const threadAuthorName = threadAuthor?.display_name?.trim() || "Usuario";
  const threadAuthorAvatar = resolveAvatarSrc(threadAuthor?.avatar_url ?? "", threadAuthorName, {
    background: "101418",
    color: "e0e3e8",
  });
  const threadImageUrl = threadRow.image_path
    ? supabasePublic.storage.from("forum-images").getPublicUrl(threadRow.image_path).data.publicUrl
    : null;
  const canDeleteThread = Boolean(user) && (user!.id === threadRow.author_id || isAdmin);
  const linkedPostRow = (linkedPost ?? null) as { id: string; title: string } | null;

  // ---- Server actions ----
  async function createReply(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/foro/${threadId}?error=reply_unauthorized`);
    }

    const body = String(formData.get("body") ?? "").trim();
    if (!body || body.length > MAX_REPLY_LENGTH) {
      redirect(`/foro/${threadId}?error=reply_invalid`);
    }

    const rawParentId = String(formData.get("parent_id") ?? "").trim();
    let parentId: string | null = null;
    if (rawParentId) {
      // El parent debe pertenecer a este hilo.
      const { data: parent } = await supabaseServer
        .from("forum_posts")
        .select("id, thread_id")
        .eq("id", rawParentId)
        .maybeSingle();
      if (parent && parent.thread_id === threadId) {
        parentId = parent.id;
      }
    }

    const { error: replyError } = await supabaseServer.from("forum_posts").insert({
      thread_id: threadId,
      author_id: actionUser.id,
      parent_id: parentId,
      body,
    });

    if (replyError) {
      redirect(`/foro/${threadId}?error=reply_create`);
    }

    revalidatePath(`/foro/${threadId}`);
  }

  async function deleteReply(formData: FormData) {
    "use server";

    const replyId = String(formData.get("reply_id") ?? "").trim();
    if (!replyId) {
      redirect(`/foro/${threadId}?error=reply_delete`);
    }

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/foro/${threadId}?error=reply_delete_unauthorized`);
    }

    const [{ data: targetReply }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("forum_posts").select("id, author_id").eq("id", replyId).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetReply) {
      redirect(`/foro/${threadId}?error=reply_delete`);
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const canDelete = actionUser.id === targetReply.author_id || canManageContent(actionRole);
    if (!canDelete) {
      redirect(`/foro/${threadId}?error=reply_delete_unauthorized`);
    }

    // Soft-delete: conserva el árbol (los hijos siguen colgando del nodo).
    const { error: deleteError } = await supabaseServer
      .from("forum_posts")
      .update({ is_deleted: true })
      .eq("id", replyId);

    if (deleteError) {
      redirect(`/foro/${threadId}?error=reply_delete`);
    }

    revalidatePath(`/foro/${threadId}`);
  }

  async function deleteThread() {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/foro/${threadId}?error=thread_delete_unauthorized`);
    }

    const [{ data: targetThread }, { data: actionProfile }] = await Promise.all([
      supabaseServer.from("forum_threads").select("author_id, image_path").eq("id", threadId).maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetThread) {
      redirect("/foro");
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const canDelete = actionUser.id === targetThread.author_id || canManageContent(actionRole);
    if (!canDelete) {
      redirect(`/foro/${threadId}?error=thread_delete_unauthorized`);
    }

    // Limpieza de votos (polimórficos, sin FK): hilo + sus respuestas. El cascade de
    // la FK borra forum_posts; los votos quedarían huérfanos si no se limpian acá.
    const { data: threadReplies } = await supabaseServer
      .from("forum_posts")
      .select("id")
      .eq("thread_id", threadId);
    const replyIds = (threadReplies ?? []).map((reply) => reply.id);

    await supabaseServer.from("forum_votes").delete().eq("target_type", "thread").eq("target_id", threadId);
    if (replyIds.length > 0) {
      await supabaseServer.from("forum_votes").delete().eq("target_type", "post").in("target_id", replyIds);
    }

    const { error: deleteError } = await supabaseServer.from("forum_threads").delete().eq("id", threadId);
    if (deleteError) {
      redirect(`/foro/${threadId}?error=thread_delete`);
    }

    if (targetThread.image_path) {
      await supabaseServer.storage.from("forum-images").remove([targetThread.image_path]);
    }

    revalidatePath("/foro");
    redirect("/foro");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10">
      <nav className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#bacbb6]">
        <Link href="/foro" className="transition-colors hover:text-[#40fe6d]">
          Foro
        </Link>
        {category?.slug ? (
          <>
            <span className="mx-2 text-[#bacbb6]/50">/</span>
            <Link href={`/foro?categoria=${category.slug}`} className="transition-colors hover:text-[#40fe6d]">
              {category.name}
            </Link>
          </>
        ) : null}
      </nav>

      {errorCode ? (
        <p className="mb-6 inline-flex rounded border border-rose-900/50 bg-rose-950/40 px-4 py-2 text-xs font-semibold text-rose-300">
          {ERROR_MESSAGES[errorCode] ?? "Ocurrió un error durante la acción."}
        </p>
      ) : null}

      {/* Cabecera del hilo */}
      <article className="rounded-2xl border border-[#3c4b3a]/30 bg-[#181c20] p-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#bacbb6]">
          {category?.name ? (
            <span className="rounded bg-[#40fe6d]/10 px-2 py-0.5 text-[#40fe6d]">{category.name}</span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-block h-4 w-4 overflow-hidden rounded-full">
              <Image src={threadAuthorAvatar} alt={threadAuthorName} fill sizes="16px" className="object-cover" />
            </span>
            {threadAuthorName}
          </span>
          <span>· {formatRelative(threadRow.created_at)}</span>
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{threadRow.title}</h1>

        {linkedPostRow ? (
          <Link
            href={`/post/${linkedPostRow.id}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#3c4b3a]/40 bg-[#0b0f12] px-3 py-1.5 text-xs font-semibold text-[#bacbb6] transition-colors hover:border-[#40fe6d]/40 hover:text-[#40fe6d]"
          >
            <FileText size={13} />
            Sobre el artículo: {linkedPostRow.title}
          </Link>
        ) : null}

        {threadImageUrl ? (
          <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden rounded-xl border border-[#3c4b3a]/30">
            <Image src={threadImageUrl} alt={threadRow.title} fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover" />
          </div>
        ) : null}

        <MarkdownRenderer content={threadRow.body} className="mt-5 max-w-none" />

        {/* Barra de acciones: voto (izq) + borrar (der), a todo el ancho. */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#3c4b3a]/20 pt-4">
          <ForumVoteControl
            targetType="thread"
            targetId={threadRow.id}
            initialScore={threadRow.score}
            initialUserValue={threadUserValue}
            isAuthenticated={Boolean(user)}
            orientation="horizontal"
          />
          {canDeleteThread ? (
            <ForumDeleteAction
              action={deleteThread}
              title="Eliminar hilo"
              description="Esta acción no se puede deshacer. Se eliminarán el hilo y todas sus respuestas de forma permanente."
              triggerLabel="Eliminar hilo"
            />
          ) : null}
        </div>
      </article>

      {/* Responder al hilo */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">
          Respuestas ({numberFormatter.format(threadRow.reply_count)})
        </h2>
        {user ? (
          <ForumReplyForm action={createReply} placeholder="Escribe tu respuesta al hilo..." />
        ) : (
          <div className="rounded-xl border border-[#3c4b3a]/30 bg-[#0b0f12] px-5 py-4 text-sm text-[#bacbb6]">
            Inicia sesión con Google para responder.
          </div>
        )}
      </section>

      {/* Árbol de respuestas */}
      <section className="mt-6 space-y-3">
        {orderedReplies.length === 0 ? (
          <div className="rounded-xl border border-[#3c4b3a]/30 bg-[#181c20] px-6 py-6 text-sm text-[#bacbb6]">
            Todavía no hay respuestas. Sé la primera persona en responder.
          </div>
        ) : (
          orderedReplies.map((reply) => {
            const indentLevel = Math.min(reply.depth, MAX_VISUAL_DEPTH);
            const isFlattened = reply.depth > MAX_VISUAL_DEPTH;
            const parentName = reply.parent_id ? authorNameById.get(reply.parent_id) : null;
            const author = relationFirst(reply.profiles);
            const authorName = author?.display_name?.trim() || "Usuario";
            const authorAvatar = resolveAvatarSrc(author?.avatar_url ?? "", authorName, {
              background: "262a2f",
              color: "e0e3e8",
            });
            const canDeleteReply = Boolean(user) && !reply.is_deleted && (user!.id === reply.author_id || isAdmin);

            return (
              <div
                key={reply.id}
                style={{ marginLeft: `${indentLevel * 20}px` }}
                className="rounded-xl border border-[#3c4b3a]/25 bg-[#181c20] p-4"
              >
                {isFlattened && parentName ? (
                  <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#bacbb6]/80">
                    <CornerDownRight size={12} />
                    En respuesta a @{parentName}
                  </p>
                ) : null}

                {reply.is_deleted ? (
                  <p className="text-sm italic text-[#bacbb6]/60">Respuesta eliminada</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#bacbb6]">
                        <span className="relative inline-block h-5 w-5 overflow-hidden rounded-full">
                          <Image src={authorAvatar} alt={authorName} fill sizes="20px" className="object-cover" />
                        </span>
                        <span className="text-white">{authorName}</span>
                        <span>· {formatRelative(reply.created_at)}</span>
                      </div>
                      {canDeleteReply ? (
                        <ForumDeleteAction
                          action={deleteReply}
                          hiddenName="reply_id"
                          hiddenValue={reply.id}
                          iconOnly
                          title="Eliminar respuesta"
                          description="La respuesta se marcará como eliminada. Las respuestas que cuelgan de ella se conservan."
                          triggerLabel="Eliminar respuesta"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-950/20 text-rose-300 transition hover:bg-rose-900/40 hover:text-rose-200"
                        />
                      ) : null}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#e0e3e8]">
                      {reply.body}
                    </p>

                    <div className="mt-3 flex items-center gap-4">
                      <ForumVoteControl
                        targetType="post"
                        targetId={reply.id}
                        initialScore={reply.score}
                        initialUserValue={replyVoteMap.get(reply.id) ?? 0}
                        isAuthenticated={Boolean(user)}
                        orientation="horizontal"
                      />
                      {user ? (
                        <ForumReplyForm
                          action={createReply}
                          parentId={reply.id}
                          triggerLabel="Responder"
                          placeholder={`Responder a @${authorName}...`}
                        />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </section>

      {orderedReplies.length === 0 ? null : (
        <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-[#bacbb6]/60">
          <MessageSquare size={12} />
          Las respuestas más votadas aparecen primero.
        </p>
      )}
    </div>
  );
}
