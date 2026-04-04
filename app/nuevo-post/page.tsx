import { createClient } from "@/lib/supabase/server";
import MovieSearch from "@/components/movie-search";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import SubmitButton from "@/components/submit-button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchTmdbMovieDetails } from "@/lib/tmdb/movie-details";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Faltan campos obligatorios (titulo, imagen o contenido).",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  profile: "No se pudo crear/actualizar tu perfil de autor.",
  movie_required: "Debes seleccionar una pelicula para publicar.",
  movie: "No se pudo asociar la pelicula seleccionada.",
  image_upload: "No se pudo subir la imagen del post al storage.",
  post: "No se pudo guardar el post en la base de datos.",
};

type NewPostPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewPostPage({ searchParams }: NewPostPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { error: errorCode } = await searchParams;

  async function createPost(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect("/");
    }

    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const tmdbIdInput = String(formData.get("tmdb_id") ?? "").trim();
    const movieTitle = String(formData.get("movie_title") ?? "").trim();
    const movieReleaseDateInput = String(formData.get("movie_release_date") ?? "").trim();
    const movieOverviewInput = String(formData.get("movie_overview") ?? "").trim();
    const imageFile = formData.get("image");

    if (!title || !content || !(imageFile instanceof File) || imageFile.size === 0) {
      redirect("/nuevo-post?error=invalid");
    }

    const tmdbId = Number.parseInt(tmdbIdInput, 10);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !movieTitle) {
      redirect("/nuevo-post?error=movie_required");
    }

    const tmdbMovie = await fetchTmdbMovieDetails(tmdbId);
    if (!tmdbMovie) {
      redirect("/nuevo-post?error=movie");
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      redirect("/nuevo-post?error=image_invalid");
    }

    const displayName =
      String(actionUser.user_metadata?.full_name ?? actionUser.user_metadata?.name ?? "").trim() ||
      actionUser.email?.split("@")[0] ||
      null;
    const avatarUrl =
      typeof actionUser.user_metadata?.avatar_url === "string"
        ? actionUser.user_metadata.avatar_url
        : null;

    const { error: profileError } = await supabaseServer.from("profiles").upsert({
      id: actionUser.id,
      display_name: displayName,
      avatar_url: avatarUrl,
    });

    if (profileError) {
      redirect("/nuevo-post?error=profile");
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
      redirect("/nuevo-post?error=movie");
    }

    const fileNameParts = imageFile.name.split(".");
    const rawExt = fileNameParts.length > 1 ? fileNameParts.pop() ?? "" : "";
    const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const imagePath = `${actionUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabaseServer.storage
      .from("post-images")
      .upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadError) {
      redirect("/nuevo-post?error=image_upload");
    }

    const { data: post, error: postError } = await supabaseServer
      .from("posts")
      .insert({
        author_id: actionUser.id,
        movie_id: movie.id,
        title,
        content,
        image_path: imagePath,
      })
      .select("id")
      .single();

    if (postError || !post) {
      await supabaseServer.storage.from("post-images").remove([imagePath]);
      redirect("/nuevo-post?error=post");
    }

    revalidatePath("/");
    redirect(`/post/${post.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 lg:py-20">
      <div className="mb-12">
        <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white mb-3">
          Crear nuevo post
        </h1>
        <p className="text-[#bacbb6] font-body text-lg">
          Crea tu analisis cinematografico para la comunidad.
        </p>

        {errorCode ? (
          <p className="mt-6 rounded border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-400 font-body">
            {ERROR_MESSAGES[errorCode] ??
              "No se pudo publicar el post. Revisa los campos e intenta nuevamente."}
          </p>
        ) : null}
      </div>

      <form action={createPost} className="space-y-10">
        {/* Title Input */}
        <div>
          <input
            name="title"
            required
            placeholder="Titulo del post..."
            className="w-full bg-transparent text-4xl lg:text-5xl font-bold text-white placeholder:text-white/20 outline-none pb-4 border-b border-[#3c4b3a]/30 focus:border-[#43fe6d] transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MovieSearch />
          <PostImageUpload required emptyLabel="Subir portada o arrastrar y soltar" />
        </div>

        <MarkdownEditor
          required
          name="content"
          placeholder="Escribe tu analisis..."
        />

        {/* Action Buttons */}
        <div className="flex justify-end pt-8 mt-8 border-t border-[#3c4b3a]/20">
          <SubmitButton
            idleLabel="Publicar"
            pendingLabel="Publicando..."
            className="w-full sm:w-auto px-6 py-3 rounded-xl cursor-pointer bg-[#00e054] text-sm font-bold tracking-widest uppercase text-[#00390f] hover:bg-[#40fe6d] transition-colors shadow-[0_0_20px_rgba(0,224,84,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>
    </div>
  );
}
