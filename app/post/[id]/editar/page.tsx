import { canManagePost } from "@/lib/posts/permissions";
import MovieSearch from "@/components/movie-search";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import SubmitButton from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { relationFirst, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fetchTmdbMovieDetails } from "@/lib/tmdb/movie-details";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "No tienes permisos para editar este post.",
  invalid: "El titulo y el contenido son obligatorios.",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  movie: "No se pudo asociar la pelicula seleccionada.",
  image_upload: "No se pudo subir la imagen del post al storage.",
  update: "No se pudo actualizar el post. Intenta nuevamente.",
};

type EditPostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

type EditablePost = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  image_path: string | null;
  movies: RelationOneOrMany<{
    tmdb_id: number;
    title: string;
    release_date: string | null;
    overview: string | null;
    poster_path: string | null;
  }>;
};

export default async function EditPostPage({ params, searchParams }: EditPostPageProps) {
  const { id } = await params;
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/post/${id}`);
  }

  const [{ data: post }, { data: profile }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, author_id, title, content, image_path, movies(tmdb_id, title, release_date, overview, poster_path)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (!post) {
    notFound();
  }

  const viewerRole = typeof profile?.role === "string" ? profile.role : null;
  const canEdit = canManagePost({
    viewerId: user.id,
    viewerRole,
    postAuthorId: post.author_id,
  });

  if (!canEdit) {
    redirect(`/post/${id}?error=unauthorized`);
  }

  async function updatePost(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const [{ data: targetPost }, { data: actionProfile }] = await Promise.all([
      supabaseServer
        .from("posts")
        .select("author_id, image_path")
        .eq("id", id)
        .maybeSingle(),
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

    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const tmdbIdInput = String(formData.get("tmdb_id") ?? "").trim();
    const movieTitle = String(formData.get("movie_title") ?? "").trim();
    const movieReleaseDateInput = String(formData.get("movie_release_date") ?? "").trim();
    const movieOverviewInput = String(formData.get("movie_overview") ?? "").trim();
    const imageFile = formData.get("image");

    if (!title || !content) {
      redirect(`/post/${id}/editar?error=invalid`);
    }

    let nextMovieId: string | null = null;
    const hasMovieUpdate = tmdbIdInput.length > 0 || movieTitle.length > 0;
    if (hasMovieUpdate) {
      const tmdbId = Number.parseInt(tmdbIdInput, 10);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !movieTitle) {
        redirect(`/post/${id}/editar?error=movie`);
      }

      const tmdbMovie = await fetchTmdbMovieDetails(tmdbId);
      if (!tmdbMovie) {
        redirect(`/post/${id}/editar?error=movie`);
      }

      const { data: movie, error: movieError } = await supabaseServer
        .from("movies")
        .upsert(
          {
            tmdb_id: tmdbId,
            title: tmdbMovie.title,
            release_date: tmdbMovie.releaseDate ?? (movieReleaseDateInput || null),
            overview: tmdbMovie.overview ?? (movieOverviewInput || null),
            director: tmdbMovie.director,
            poster_path: tmdbMovie.posterPath,
          },
          { onConflict: "tmdb_id" },
        )
        .select("id")
        .single();

      if (movieError || !movie) {
        redirect(`/post/${id}/editar?error=movie`);
      }

      nextMovieId = movie.id;
    }

    let nextImagePath: string | null = null;
    if (imageFile instanceof File && imageFile.size > 0) {
      if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        redirect(`/post/${id}/editar?error=image_invalid`);
      }

      const fileNameParts = imageFile.name.split(".");
      const rawExt = fileNameParts.length > 1 ? fileNameParts.pop() ?? "" : "";
      const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      nextImagePath = `${actionUser.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseServer.storage
        .from("post-images")
        .upload(nextImagePath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });

      if (uploadError) {
        redirect(`/post/${id}/editar?error=image_upload`);
      }
    }

    const updatePayload: {
      title: string;
      content: string;
      image_path?: string;
      movie_id?: string;
    } = {
      title,
      content,
    };

    if (nextMovieId) {
      updatePayload.movie_id = nextMovieId;
    }
    if (nextImagePath) {
      updatePayload.image_path = nextImagePath;
    }

    const { error: updateError } = await supabaseServer
      .from("posts")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      if (nextImagePath) {
        await supabaseServer.storage.from("post-images").remove([nextImagePath]);
      }
      redirect(`/post/${id}/editar?error=update`);
    }

    if (nextImagePath && targetPost.image_path) {
      await supabaseServer.storage.from("post-images").remove([targetPost.image_path]);
    }

    revalidatePath("/");
    revalidatePath(`/post/${id}`);
    revalidatePath(`/post/${id}/editar`);
    redirect(`/post/${id}`);
  }

  const editablePost = post as EditablePost;
  const selectedMovie = relationFirst(editablePost.movies);
  const currentImageUrl = editablePost.image_path
    ? supabase.storage.from("post-images").getPublicUrl(editablePost.image_path).data.publicUrl
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 lg:py-20">
      <div className="mb-12">
        <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white mb-3">Editar post</h1>
        <p className="text-[#bacbb6] font-body text-lg">Crea tu analisis cinematografico para la comunidad.</p>

        {errorCode ? (
          <p className="mt-6 rounded border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-400 font-body">
            {ERROR_MESSAGES[errorCode] ??
              "No se pudo actualizar el post. Revisa los campos e intenta nuevamente."}
          </p>
        ) : null}
      </div>

      <form action={updatePost} className="space-y-10">
        <div>
          <input
            name="title"
            required
            defaultValue={editablePost.title}
            placeholder="Titulo del post..."
            className="w-full bg-transparent text-4xl lg:text-5xl font-bold text-white placeholder:text-white/20 outline-none pb-4 border-b border-[#3c4b3a]/30 focus:border-[#43fe6d] transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MovieSearch initialMovie={selectedMovie} />
          <PostImageUpload emptyLabel="Subir portada" initialImageUrl={currentImageUrl} />
        </div>

        <MarkdownEditor
          required
          name="content"
          initialValue={editablePost.content}
          placeholder="Escribe tu analisis..."
        />

        <div className="flex justify-end pt-8 mt-8 border-t border-[#3c4b3a]/20">
          <SubmitButton
            idleLabel="Guardar post"
            pendingLabel="Guardando..."
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#00e054] text-sm font-bold tracking-widest uppercase text-[#00390f] hover:bg-[#40fe6d] transition-colors shadow-[0_0_20px_rgba(0,224,84,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>
    </div>
  );
}
