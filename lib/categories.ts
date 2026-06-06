import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugifyCategory(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type ResolveInput = {
  categoryId?: string | null;
  newCategoryName?: string | null;
};

type ResolveResult = {
  categoryId: string | null;
  error?: "create_failed" | "invalid_name";
};

/**
 * Devuelve el category_id a asignar a un post a partir del form.
 * - Si viene un nombre nuevo, crea la categoría (o reutiliza una con el mismo slug).
 * - Si viene un id existente válido, lo usa.
 * - En cualquier otro caso, queda sin categoría (null).
 * El llamador debe haber validado que el usuario es admin (lo fuerza también la RLS).
 */
export async function resolveCategoryId(
  supabase: SupabaseClient,
  { categoryId, newCategoryName }: ResolveInput,
): Promise<ResolveResult> {
  const newName = (newCategoryName ?? "").trim();

  if (newName) {
    const slug = slugifyCategory(newName);
    if (!slug) {
      return { categoryId: null, error: "invalid_name" };
    }

    // Reutilizar si ya existe una categoría con ese slug (evita duplicados).
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing?.id) {
      return { categoryId: existing.id };
    }

    const { data: created, error } = await supabase
      .from("categories")
      .insert({ name: newName, slug })
      .select("id")
      .single();

    if (error || !created) {
      return { categoryId: null, error: "create_failed" };
    }

    return { categoryId: created.id };
  }

  if (categoryId && UUID_RE.test(categoryId)) {
    return { categoryId };
  }

  return { categoryId: null };
}
