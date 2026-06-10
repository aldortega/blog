import { createClient } from "@/lib/supabase/server";
import PostImageUpload from "@/components/post-image-upload";
import MarkdownEditor from "@/components/markdown-editor";
import CategorySelect from "@/components/category-select";
import SubmitButton from "@/components/submit-button";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { canManageContent } from "@/lib/posts/permissions";

export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "No tienes permisos para editar este hilo.",
  invalid: "El título, el contenido y la categoría son obligatorios.",
  image_invalid: "La imagen debe ser JPG/PNG/WEBP y pesar menos de 5MB.",
  image_upload: "No se pudo subir la imagen del hilo al storage.",
  update: "No se pudo actualizar el hilo. Intenta nuevamente.",
};

type EditThreadPageProps = {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ error?: string }>;
};

type EditableThread = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  image_path: string | null;
  category_id: string;
  content_id: string | null;
};

export default async function EditThreadPage({ params, searchParams }: EditThreadPageProps) {
  const { threadId } = await params;
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/foro/${threadId}`);
  }

  const [{ data: thread }, { data: profile }, { data: categories }] = await Promise.all([
    supabase
      .from("forum_threads")
      .select("id, author_id, title, body, image_path, category_id, content_id")
      .eq("id", threadId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (!thread) {
    notFound();
  }

  const editableThread = thread as EditableThread;
  const viewerRole = typeof profile?.role === "string" ? profile.role : null;
  const isAdmin = canManageContent(viewerRole);
  const isAuthor = user.id === editableThread.author_id;

  if (!isAuthor && !isAdmin) {
    redirect(`/foro/${threadId}?error=unauthorized`);
  }

  async function updateThread(formData: FormData) {
    "use server";

    const supabaseServer = await createClient();
    const {
      data: { user: actionUser },
    } = await supabaseServer.auth.getUser();

    if (!actionUser) {
      redirect(`/foro/${threadId}?error=unauthorized`);
    }

    const [{ data: targetThread }, { data: actionProfile }] = await Promise.all([
      supabaseServer
        .from("forum_threads")
        .select("author_id, image_path, content_id")
        .eq("id", threadId)
        .maybeSingle(),
      supabaseServer.from("profiles").select("role").eq("id", actionUser.id).maybeSingle(),
    ]);

    if (!targetThread) {
      redirect("/foro");
    }

    const actionRole = typeof actionProfile?.role === "string" ? actionProfile.role : null;
    const canEdit = actionUser.id === targetThread.author_id || canManageContent(actionRole);

    if (!canEdit) {
      redirect(`/foro/${threadId}?error=unauthorized`);
    }

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("content") ?? "").trim();
    const categoryId = String(formData.get("category_id") ?? "").trim();
    const imageFile = formData.get("image");

    if (!title || !body || !categoryId || !UUID_RE.test(categoryId)) {
      redirect(`/foro/${threadId}/editar?error=invalid`);
    }

    let nextImagePath: string | null = null;
    if (imageFile instanceof File && imageFile.size > 0) {
      if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        redirect(`/foro/${threadId}/editar?error=image_invalid`);
      }

      const fileNameParts = imageFile.name.split(".");
      const rawExt = fileNameParts.length > 1 ? fileNameParts.pop() ?? "" : "";
      const extension = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      nextImagePath = `${actionUser.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseServer.storage
        .from("forum-images")
        .upload(nextImagePath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });

      if (uploadError) {
        redirect(`/foro/${threadId}/editar?error=image_upload`);
      }
    }

    const updatePayload: {
      title: string;
      body: string;
      category_id: string;
      image_path?: string;
    } = {
      title,
      body,
      category_id: categoryId,
    };

    if (nextImagePath) {
      updatePayload.image_path = nextImagePath;
    }

    const { error: updateError } = await supabaseServer
      .from("forum_threads")
      .update(updatePayload)
      .eq("id", threadId);

    if (updateError) {
      if (nextImagePath) {
        await supabaseServer.storage.from("forum-images").remove([nextImagePath]);
      }
      redirect(`/foro/${threadId}/editar?error=update`);
    }

    if (nextImagePath && targetThread.image_path) {
      await supabaseServer.storage.from("forum-images").remove([targetThread.image_path]);
    }

    revalidatePath("/foro");
    revalidatePath(`/foro/${threadId}`);
    revalidatePath(`/foro/${threadId}/editar`);
    if (targetThread.content_id) {
      revalidatePath(`/post/${targetThread.content_id}`);
    }
    redirect(`/foro/${threadId}`);
  }

  const currentImageUrl = editableThread.image_path
    ? supabase.storage.from("forum-images").getPublicUrl(editableThread.image_path).data.publicUrl
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 lg:py-16">
      <nav className="mb-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#bacbb6]">
        <Link href="/foro" className="transition-colors hover:text-[#40fe6d]">
          Foro
        </Link>
        <span className="mx-2 text-[#bacbb6]/50">/</span>
        <Link href={`/foro/${threadId}`} className="transition-colors hover:text-[#40fe6d]">
          Detalle
        </Link>
        <span className="mx-2 text-[#bacbb6]/50">/</span>
        <span className="text-white">Editar hilo</span>
      </nav>

      <div className="mb-10">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-white lg:text-5xl">Editar debate</h1>
        <p className="font-body text-lg text-[#bacbb6]">
          Actualiza los datos del hilo de debate.
        </p>

        {errorCode ? (
          <p className="mt-5 rounded border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-400 font-body">
            {ERROR_MESSAGES[errorCode] ?? "No se pudo actualizar el hilo. Revisa los campos."}
          </p>
        ) : null}
      </div>

      <form action={updateThread} className="space-y-8">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={editableThread.title}
          placeholder="Título del hilo..."
          className="w-full border-b border-[#3c4b3a]/30 bg-transparent pb-4 text-3xl font-bold text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#43fe6d] lg:text-4xl"
        />

        <CategorySelect
          required
          allowCreate={false}
          categories={(categories ?? []) as { id: string; name: string }[]}
          defaultCategoryId={editableThread.category_id}
        />

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#bacbb6]">
            Imagen (opcional)
          </p>
          <PostImageUpload emptyLabel="Subir imagen" initialImageUrl={currentImageUrl} />
        </div>

        <MarkdownEditor
          required
          name="content"
          initialValue={editableThread.body}
          placeholder="Escribe el contenido del hilo..."
        />

        <div className="flex justify-end border-t border-[#3c4b3a]/20 pt-8">
          <SubmitButton
            idleLabel="Guardar hilo"
            pendingLabel="Guardando..."
            className="w-full cursor-pointer rounded-xl bg-[#00e054] px-6 py-3 text-sm font-bold uppercase tracking-widest text-[#00390f] shadow-[0_0_20px_rgba(0,224,84,0.3)] transition-colors hover:bg-[#40fe6d] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          />
        </div>
      </form>
    </div>
  );
}
