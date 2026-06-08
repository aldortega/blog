"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleAiFeature(disable: boolean) {
  const supabase = await createClient();

  // Verify authorization (only admins can change global settings)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No autenticado.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    throw new Error("No autorizado.");
  }

  // Update site setting in the database
  const { error } = await supabase.from("site_settings").upsert(
    {
      key: "disable_ai",
      value: disable, // this will be stored as true/false jsonb
    },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`Error al actualizar la configuración: ${error.message}`);
  }

  // Revalidate routes to clear cached layouts/pages and propagate changes instantly
  revalidatePath("/");
  revalidatePath("/nuevo-post");
  revalidatePath("/post/[id]", "layout");
}
