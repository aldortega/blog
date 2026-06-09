import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchContent, MAX_QUERY_LENGTH, SOURCES_SIMILARITY_THRESHOLD } from "@/lib/ai/search";
import { toModelView, toSources } from "@/lib/ai/chat";

// Ejecuta la tool buscar_contenidos del asistente de voz (fase 6) y registra la
// consulta para la analítica de gaps (canal 'voice'). El navegador llama acá cuando
// la Live API emite el functionCall; devolvemos dos vistas: `forModel` (lo que el
// cliente reenvía a Gemini como functionResponse, solo título+fragmento) y `sources`
// (tarjetas para mostrar en pantalla, armadas desde los resultados reales).
//
// Autenticado: el asistente de voz requiere login, igual que el de texto. A
// diferencia de /api/search (público y sin log), este endpoint sí registra.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: settingData } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "disable_ai")
    .maybeSingle();

  if (settingData?.value === true) {
    return NextResponse.json({ error: "Las funciones de IA están deshabilitadas." }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
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
    console.error("Error running voice search", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo procesar la búsqueda." }, { status: 502 });
  }

  const hadResults = results.length > 0;

  // Registrar para la analítica de gaps (mismo esquema que el chatbot de texto).
  const { error: logError } = await supabase
    .from("chatbot_queries")
    .insert({ user_id: user.id, query, had_results: hadResults, channel: "voice" });
  if (logError) {
    console.error("Error logging voice query", { error: logError.message });
  }

  // El modelo recibe todos los resultados para tener contexto amplio; las tarjetas
  // para el usuario se filtran con un umbral más estricto para evitar sugerencias
  // poco relevantes.
  const displayResults = results.filter((r) => r.similarity >= SOURCES_SIMILARITY_THRESHOLD);

  return NextResponse.json({
    forModel: toModelView(results),
    sources: toSources(displayResults),
    hadResults,
  });
}
