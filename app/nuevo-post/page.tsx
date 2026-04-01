import { createClient } from "@/lib/supabase/server";
import MovieSearch from "@/components/movie-search";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      redirect("/nuevo-post?error=image_invalid");
    }

    const displayName =
      String(actionUser.user_metadata?.full_name ?? actionUser.user_metadata?.name ?? "").trim() ||
      actionUser.email?.split("@")[0] ||
      null;

    const { error: profileError } = await supabaseServer.from("profiles").upsert({
      id: actionUser.id,
      display_name: displayName,
    });

    if (profileError) {
      redirect("/nuevo-post?error=profile");
    }

    const { data: movie, error: movieError } = await supabaseServer
      .from("movies")
      .upsert(
        {
          tmdb_id: tmdbId,
          title: movieTitle,
          release_date: movieReleaseDateInput || null,
          overview: movieOverviewInput || null,
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
          Create New Post
        </h1>
        <p className="text-[#bacbb6] font-body text-lg">
          Craft your cinematic analysis for the community.
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
            placeholder="Post Title..."
            className="w-full bg-transparent text-4xl lg:text-5xl font-bold text-white placeholder:text-white/20 outline-none pb-4 border-b border-[#3c4b3a]/30 focus:border-[#43fe6d] transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MovieSearch />

          {/* Cover Image Card */}
          <div className="bg-[#181c20] rounded-xl p-6 min-h-[160px] relative overflow-hidden group">
            {/* Subtle gradient glow behind the dashed box */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(64,254,109,0.05)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <div className="flex items-center gap-2 mb-4 text-[#40fe6d] text-xs font-bold tracking-widest uppercase relative z-10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span>Cover Image</span>
            </div>
            
            <div className="relative z-10 w-full h-full">
              <input
                name="image"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <div className="border border-dashed border-[#3c4b3a]/50 rounded-lg p-6 flex flex-col items-center justify-center gap-3 bg-[#0b0f12]/50 group-hover:bg-[#0b0f12]/80 group-hover:border-[#40fe6d]/50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#bacbb6]"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <span className="text-xs font-bold tracking-widest uppercase text-[#bacbb6]">Upload Poster or Drag & Drop</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Editor area */}
        <div className="bg-[#181c20] rounded-xl overflow-hidden min-h-[400px] flex flex-col">
          {/* Toolbar fake */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3c4b3a]/20">
            <div className="flex items-center gap-6 text-[#e0e3e8]">
              <button type="button" className="hover:text-[#40fe6d] transition-colors font-bold">B</button>
              <button type="button" className="hover:text-[#40fe6d] transition-colors italic font-serif">I</button>
              <button type="button" className="hover:text-[#40fe6d] transition-colors line-through">T</button>
              <button type="button" className="hover:text-[#40fe6d] transition-colors font-bold text-xl leading-none">&quot;</button>
              <button type="button" className="hover:text-[#40fe6d] transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
              <button type="button" className="hover:text-[#40fe6d] transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
              </button>
            </div>
            <button type="button" className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-[#bacbb6] hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
          </div>
          <textarea
            name="content"
            required
            placeholder="Write your analysis here..."
            className="flex-1 w-full bg-transparent p-6 text-base text-[#e0e3e8] placeholder:text-[#bacbb6]/50 outline-none resize-none font-body leading-relaxed"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end pt-8 mt-8 border-t border-[#3c4b3a]/20">
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#00e054] text-sm font-bold tracking-widest uppercase text-[#00390f] hover:bg-[#40fe6d] transition-colors shadow-[0_0_20px_rgba(0,224,84,0.3)]"
          >
            Publish Post
          </button>
        </div>
      </form>
    </div>
  );
}
