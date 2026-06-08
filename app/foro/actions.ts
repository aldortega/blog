"use server";

import { createClient } from "@/lib/supabase/server";

export type VoteTargetType = "thread" | "post";
export type VoteValue = 1 | -1;

export type CastVoteResult =
  | { ok: true; score: number; userValue: number }
  | { ok: false; error: "unauthorized" | "invalid" | "save" };

/**
 * Registra/alterna el voto del usuario actual sobre un hilo o respuesta.
 * Toggle estilo Reddit: revotar en la misma dirección lo quita; votar en la otra
 * lo cambia. El score se mantiene desnormalizado por trigger; acá lo releemos para
 * devolver el valor autoritativo al cliente optimista. Voto propio permitido.
 */
export async function castVote(
  targetType: VoteTargetType,
  targetId: string,
  value: VoteValue,
): Promise<CastVoteResult> {
  if ((targetType !== "thread" && targetType !== "post") || (value !== 1 && value !== -1)) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const { data: existing } = await supabase
    .from("forum_votes")
    .select("id, value")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  let userValue: number = value;

  if (existing && existing.value === value) {
    const { error } = await supabase.from("forum_votes").delete().eq("id", existing.id);
    if (error) {
      return { ok: false, error: "save" };
    }
    userValue = 0;
  } else {
    const { error } = await supabase.from("forum_votes").upsert(
      { user_id: user.id, target_type: targetType, target_id: targetId, value },
      { onConflict: "user_id,target_type,target_id" },
    );
    if (error) {
      return { ok: false, error: "save" };
    }
  }

  const table = targetType === "thread" ? "forum_threads" : "forum_posts";
  const { data: target } = await supabase.from(table).select("score").eq("id", targetId).maybeSingle();

  return { ok: true, score: target?.score ?? 0, userValue };
}
