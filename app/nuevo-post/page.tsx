import { createClient } from "@/lib/supabase/server";
import { normalizeAvatarUrl } from "@/lib/avatar";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import CategorySelect from "@/components/category-select";
import SubmitButton from "@/components/submit-button";
import { canManageContent } from "@/lib/posts/permissions";
import { resolveCategoryId } from "@/lib/categories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { generatePostSummary } from "@/lib/ai/generate-post-summary";
import { generatePostEmbeddings } from "@/lib/ai/embeddings";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Faltan campos obligatorios (titulo, imagen, categoria o contenido).",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  profile: "No se pudo crear/actualizar tu perfil de autor.",
  image_upload: "No se pudo subir la imagen del post al storage.",
  category: "No se pudo crear o asignar la categoria.",
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!canManageContent(typeof profile?.role === "string" ? profile.role : null)) {
    redirect("/");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

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

    const { data: actionProfile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", actionUser.id)
      .maybeSingle();

    if (!canManageContent(typeof actionProfile?.role === "string" ? actionProfile.role : null)) {
      redirect("/");
    }

    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const imageFile = formData.get("image");
    const categoryId = String(formData.get("category_id") ?? "").trim();
    const newCategory = String(formData.get("new_category") ?? "").trim();

    if (
      !title ||
      !content ||
      (!categoryId && !newCategory)
    ) {
      redirect("/nuevo-post?error=invalid");
    }

    if (imageFile instanceof File && imageFile.size > 0) {
      if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        redirect("/nuevo-post?error=image_invalid");
      }
    }

    const displayName =
      String(actionUser.user_metadata?.full_name ?? actionUser.user_metadata?.name ?? "").trim() ||
      actionUser.email?.split("@")[0] ||
      null;
    const rawAvatarUrl =
      typeof actionUser.user_metadata?.avatar_url === "string"
        ? actionUser.user_metadata.avatar_url
        : null;
    const avatarUrl = rawAvatarUrl ? normalizeAvatarUrl(rawAvatarUrl) : null;

    const { error: profileError } = await supabaseServer.from("profiles").upsert({
      id: actionUser.id,
      display_name: displayName,
      avatar_url: avatarUrl,
    });

    if (profileError) {
      redirect("/nuevo-post?error=profile");
    }

    let imagePath: string | null = null;
    if (imageFile instanceof File && imageFile.size > 0) {
      const fileNameParts = imageFile.name.split(".");
      const rawExt = fileNameParts.length > 1 ? fileNameParts.pop() ?? "" : "";
      const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      imagePath = `${actionUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseServer.storage
        .from("post-images")
        .upload(imagePath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });

      if (uploadError) {
        redirect("/nuevo-post?error=image_upload");
      }
    }

    const { categoryId: resolvedCategoryId, error: categoryError } = await resolveCategoryId(
      supabaseServer,
      { categoryId, newCategoryName: newCategory },
    );

    if (categoryError) {
      if (imagePath) {
        await supabaseServer.storage.from("post-images").remove([imagePath]);
      }
      redirect("/nuevo-post?error=category");
    }

    const { data: post, error: postError } = await supabaseServer
      .from("posts")
      .insert({
        author_id: actionUser.id,
        title,
        content,
        image_path: imagePath,
        category_id: resolvedCategoryId,
      })
      .select("id")
      .single();

    if (postError || !post) {
      if (imagePath) {
        await supabaseServer.storage.from("post-images").remove([imagePath]);
      }
      redirect("/nuevo-post?error=post");
    }

    const { data: settingData } = await supabaseServer
      .from("site_settings")
      .select("value")
      .eq("key", "disable_ai")
      .maybeSingle();
    const isAiDisabled = settingData?.value === true;

    if (!isAiDisabled) {
      after(async () => {
        await generatePostSummary({
          supabase: supabaseServer,
          postId: post.id,
          title,
          content,
        });
        await generatePostEmbeddings({
          supabase: supabaseServer,
          postId: post.id,
          title,
          content,
        });
      });
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
          Publica un articulo para el repositorio de sistemas inteligentes.
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

        <PostImageUpload emptyLabel="Subir portada o arrastrar y soltar" />

        <CategorySelect required categories={categories ?? []} />

        <MarkdownEditor
          required
          name="content"
          placeholder="Escribe el contenido del articulo..."
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
