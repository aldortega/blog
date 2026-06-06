import { canManageContent } from "@/lib/posts/permissions";
import { resolveCategoryId } from "@/lib/categories";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import CategorySelect from "@/components/category-select";
import SubmitButton from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "No tienes permisos para editar este post.",
  invalid: "El titulo, el contenido y la categoria son obligatorios.",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  image_upload: "No se pudo subir la imagen del post al storage.",
  category: "No se pudo crear o asignar la categoria.",
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
  category_id: string | null;
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

  const [{ data: post }, { data: profile }, { data: categories }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, author_id, title, content, image_path, category_id")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (!post) {
    notFound();
  }

  const viewerRole = typeof profile?.role === "string" ? profile.role : null;

  if (!canManageContent(viewerRole)) {
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

    if (!canManageContent(actionRole)) {
      redirect(`/post/${id}?error=unauthorized`);
    }

    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const imageFile = formData.get("image");
    const categoryId = String(formData.get("category_id") ?? "").trim();
    const newCategory = String(formData.get("new_category") ?? "").trim();

    if (!title || !content || (!categoryId && !newCategory)) {
      redirect(`/post/${id}/editar?error=invalid`);
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

    const { categoryId: resolvedCategoryId, error: categoryError } = await resolveCategoryId(
      supabaseServer,
      { categoryId, newCategoryName: newCategory },
    );

    if (categoryError) {
      if (nextImagePath) {
        await supabaseServer.storage.from("post-images").remove([nextImagePath]);
      }
      redirect(`/post/${id}/editar?error=category`);
    }

    const updatePayload: {
      title: string;
      content: string;
      category_id: string | null;
      image_path?: string;
    } = {
      title,
      content,
      category_id: resolvedCategoryId,
    };

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
  const currentImageUrl = editablePost.image_path
    ? supabase.storage.from("post-images").getPublicUrl(editablePost.image_path).data.publicUrl
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 lg:py-20">
      <div className="mb-12">
        <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white mb-3">Editar post</h1>
        <p className="text-[#bacbb6] font-body text-lg">Actualiza el articulo del repositorio.</p>

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

        <PostImageUpload emptyLabel="Subir portada" initialImageUrl={currentImageUrl} />

        <CategorySelect
          required
          categories={categories ?? []}
          defaultCategoryId={editablePost.category_id}
        />

        <MarkdownEditor
          required
          name="content"
          initialValue={editablePost.content}
          placeholder="Escribe el contenido del articulo..."
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
