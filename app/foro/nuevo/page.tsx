import { createClient } from "@/lib/supabase/server";
import { publicServerClient } from "@/lib/supabase/public-server";
import { relationFirst, type RelationOneOrMany } from "@/lib/supabase/relation-utils";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import CategorySelect from "@/components/category-select";
import SubmitButton from "@/components/submit-button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";

export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Faltan campos obligatorios (título, categoría o contenido).",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  image_upload: "No se pudo subir la imagen del hilo.",
  thread: "No se pudo crear el hilo. Intenta nuevamente.",
};

type NewThreadPageProps = {
  searchParams: Promise<{ error?: string; content?: string; categoria?: string }>;
};

export default async function NewThreadPage({ searchParams }: NewThreadPageProps) {
  const { error: errorCode, content, categoria } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/foro");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");
  const categoryList = (categories ?? []) as { id: string; name: string }[];

  // Vínculo opcional a un artículo (pre-cargado desde "Abrir debate" en el post).
  // Si está vinculado, la categoría del hilo se hereda del artículo (queda fija).
  const linkedContentId = content && UUID_RE.test(content) ? content : null;
  let linkedPost: { id: string; title: string } | null = null;
  let lockedCategory: { id: string; name: string } | null = null;
  if (linkedContentId) {
    const { data } = await publicServerClient
      .from("posts")
      .select("id, title, category_id, categories(name)")
      .eq("id", linkedContentId)
      .maybeSingle();
    if (data) {
      linkedPost = { id: data.id, title: data.title };
      const category = relationFirst(
        data.categories as RelationOneOrMany<{ name: string | null }>,
      );
      if (data.category_id && category?.name) {
        lockedCategory = { id: data.category_id, name: category.name };
      }
    }
  }

  // Categoría por defecto desde el slug (cuando se entra filtrando una categoría).
  let defaultCategoryId: string | null = null;
  if (categoria) {
    const { data: categoryRow } = await publicServerClient
      .from("categories")
      .select("id")
      .eq("slug", categoria)
      .maybeSingle();
    defaultCategoryId = categoryRow?.id ?? null;
  }

  async function createThread(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect("/foro");
    }

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("content") ?? "").trim();
    let categoryId = String(formData.get("category_id") ?? "").trim();
    const rawContentId = String(formData.get("content_id") ?? "").trim();
    const imageFile = formData.get("image");

    const linkBack = rawContentId && UUID_RE.test(rawContentId) ? `?content=${rawContentId}` : "";

    // Validamos que el artículo vinculado exista (si no, queda sin vínculo) y, si
    // tiene categoría, la heredamos forzando la del artículo sobre la del form.
    let contentId: string | null = null;
    if (rawContentId && UUID_RE.test(rawContentId)) {
      const { data: linkedPostRow } = await supabaseServer
        .from("posts")
        .select("id, category_id")
        .eq("id", rawContentId)
        .maybeSingle();
      if (linkedPostRow) {
        contentId = linkedPostRow.id;
        if (linkedPostRow.category_id) {
          categoryId = linkedPostRow.category_id;
        }
      }
    }

    if (!title || !body || !categoryId || !UUID_RE.test(categoryId)) {
      redirect(`/foro/nuevo${linkBack}${linkBack ? "&" : "?"}error=invalid`);
    }

    // Imagen opcional.
    let imagePath: string | null = null;
    if (imageFile instanceof File && imageFile.size > 0) {
      if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        redirect(`/foro/nuevo${linkBack}${linkBack ? "&" : "?"}error=image_invalid`);
      }
      const parts = imageFile.name.split(".");
      const rawExt = parts.length > 1 ? parts.pop() ?? "" : "";
      const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      imagePath = `${actionUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseServer.storage
        .from("forum-images")
        .upload(imagePath, imageFile, { contentType: imageFile.type, upsert: false });

      if (uploadError) {
        redirect(`/foro/nuevo${linkBack}${linkBack ? "&" : "?"}error=image_upload`);
      }
    }

    const { data: thread, error: threadError } = await supabaseServer
      .from("forum_threads")
      .insert({
        author_id: actionUser.id,
        category_id: categoryId,
        content_id: contentId,
        title,
        body,
        image_path: imagePath,
      })
      .select("id")
      .single();

    if (threadError || !thread) {
      if (imagePath) {
        await supabaseServer.storage.from("forum-images").remove([imagePath]);
      }
      redirect(`/foro/nuevo${linkBack}${linkBack ? "&" : "?"}error=thread`);
    }

    revalidatePath("/foro");
    if (contentId) {
      revalidatePath(`/post/${contentId}`);
    }
    redirect(`/foro/${thread.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 lg:py-16">
      <nav className="mb-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#bacbb6]">
        <Link href="/foro" className="transition-colors hover:text-[#40fe6d]">
          Foro
        </Link>
        <span className="mx-2 text-[#bacbb6]/50">/</span>
        <span className="text-white">Nuevo hilo</span>
      </nav>

      <div className="mb-10">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white lg:text-5xl">Abrir un debate</h1>
        <p className="font-body text-lg text-[#bacbb6]">
          Compartí una pregunta o tema para que la comunidad responda y vote.
        </p>

        {linkedPost ? (
          <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#40fe6d]/30 bg-[#40fe6d]/10 px-4 py-2 text-sm text-[#40fe6d]">
            <Link2 size={15} />
            Vinculado al artículo: <span className="font-semibold">{linkedPost.title}</span>
          </p>
        ) : null}

        {errorCode ? (
          <p className="mt-5 rounded border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-400 font-body">
            {ERROR_MESSAGES[errorCode] ?? "No se pudo crear el hilo. Revisa los campos."}
          </p>
        ) : null}
      </div>

      <form action={createThread} className="space-y-8">
        {linkedPost ? <input type="hidden" name="content_id" value={linkedPost.id} /> : null}

        <input
          name="title"
          required
          maxLength={200}
          placeholder="Título del hilo..."
          className="w-full border-b border-[#3c4b3a]/30 bg-transparent pb-4 text-3xl font-bold text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#43fe6d] lg:text-4xl"
        />

        {lockedCategory ? (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-[#bacbb6]">Categoría</p>
            <input type="hidden" name="category_id" value={lockedCategory.id} />
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#3c4b3a]/40 bg-[#181d22] px-4 py-3 text-base text-white">
              <span className="rounded bg-[#40fe6d]/10 px-2 py-0.5 text-sm font-semibold text-[#40fe6d]">
                {lockedCategory.name}
              </span>
              <span className="text-xs text-[#bacbb6]">heredada del artículo vinculado</span>
            </div>
          </div>
        ) : (
          <CategorySelect required allowCreate={false} categories={categoryList} defaultCategoryId={defaultCategoryId} />
        )}

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#bacbb6]">
            Imagen (opcional)
          </p>
          <PostImageUpload emptyLabel="Subir imagen o arrastrar y soltar" />
        </div>

        <MarkdownEditor required name="content" placeholder="Escribe el contenido del hilo..." />

        <div className="flex justify-end border-t border-[#3c4b3a]/20 pt-8">
          <SubmitButton
            idleLabel="Publicar hilo"
            pendingLabel="Publicando..."
            className="w-full cursor-pointer rounded-xl bg-[#00e054] px-6 py-3 text-sm font-bold uppercase tracking-widest text-[#00390f] shadow-[0_0_20px_rgba(0,224,84,0.3)] transition-colors hover:bg-[#40fe6d] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          />
        </div>
      </form>
    </div>
  );
}
