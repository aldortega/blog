import { searchContent, MAX_QUERY_LENGTH, NO_RESULTS_MESSAGE } from "@/lib/ai/search";
import { NextResponse } from "next/server";
import { publicServerClient } from "@/lib/supabase/public-server";

// Búsqueda semántica sobre la biblioteca. Pública (lectura libre): el gating de
// login se aplica recién en la UI del chatbot (fase 5). La lógica vive en
// lib/ai/search.ts, compartida con la tool del chatbot.

export async function POST(request: Request) {
  const { data: settingData } = await publicServerClient
    .from("site_settings")
    .select("value")
    .eq("key", "disable_ai")
    .maybeSingle();

  if (settingData?.value === true) {
    return NextResponse.json({ error: "Las funciones de IA están deshabilitadas." }, { status: 400 });
  }

  let query: string;
  try {
    const body = await request.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido. Se espera JSON { query }." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "La consulta no puede estar vacía." }, { status: 400 });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `La consulta supera el máximo de ${MAX_QUERY_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  let results;
  try {
    results = await searchContent(query);
  } catch (error) {
    console.error("Error running semantic search", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo procesar la búsqueda." }, { status: 502 });
  }

  if (results.length === 0) {
    return NextResponse.json({ results: [], message: NO_RESULTS_MESSAGE });
  }

  return NextResponse.json({ results });
}
