import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeFileExtension(fileName: string): string {
  const nameParts = fileName.split(".");
  const rawExtension = nameParts.length > 1 ? nameParts.pop() ?? "" : "";
  return rawExtension.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const imageFile = formData.get("image");

  if (!(imageFile instanceof File) || imageFile.size === 0) {
    return NextResponse.json({ error: "Debes enviar una imagen valida." }, { status: 400 });
  }

  if (imageFile.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
    return NextResponse.json({ error: "Solo JPG/PNG/WEBP de hasta 5MB." }, { status: 400 });
  }

  const extension = safeFileExtension(imageFile.name);
  const imagePath = `${user.id}/content/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from("post-images").upload(imagePath, imageFile, {
    contentType: imageFile.type,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("post-images").getPublicUrl(imagePath);

  return NextResponse.json({ url: publicUrl, path: imagePath });
}
