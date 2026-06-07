import { publicServerClient } from "@/lib/supabase/public-server";
import { embedQuery } from "@/lib/ai/embeddings";
import { NextResponse } from "next/server";

// Búsqueda semántica sobre la biblioteca. Pública (lectura libre): el gating de
// login se aplica recién en la UI del chatbot (fase 5). La consulta se vectoriza
// con gemini-embedding-2 y se matchea contra content_chunks vía pgvector.

// Umbral de similitud coseno (1 = idéntico). Ajustable según datos reales (fase 7).
const SIMILARITY_THRESHOLD = 0.5;
// Cantidad de chunks que pide la RPC antes de deduplicar por post.
const CHUNK_MATCH_COUNT = 12;
// Máximo de artículos devueltos tras deduplicar.
const MAX_RESULTS = 5;
const MAX_QUERY_LENGTH = 1000;
const NO_RESULTS_MESSAGE = "No hay contenido sobre eso.";

type ChunkMatch = {
  id: string;
  post_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
};

type PostMeta = {
  id: string;
  title: string;
  image_path: string | null;
};

export async function POST(request: Request) {
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

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch (error) {
    console.error("Error embedding search query", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo procesar la búsqueda." }, { status: 502 });
  }

  const supabase = publicServerClient;
  const { data: matches, error: matchError } = await supabase.rpc("match_content_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: CHUNK_MATCH_COUNT,
  });

  if (matchError) {
    console.error("Error matching content chunks", { error: matchError.message });
    return NextResponse.json({ error: "No se pudo procesar la búsqueda." }, { status: 500 });
  }

  const chunkMatches = (matches ?? []) as ChunkMatch[];

  // Deduplicar por post quedándose con el mejor chunk (la RPC ya viene ordenada
  // por cercanía, así que el primero por post es el de mayor similitud).
  const bestByPost = new Map<string, ChunkMatch>();
  for (const match of chunkMatches) {
    if (!bestByPost.has(match.post_id)) {
      bestByPost.set(match.post_id, match);
    }
  }

  const topMatches = Array.from(bestByPost.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_RESULTS);

  if (topMatches.length === 0) {
    return NextResponse.json({ results: [], message: NO_RESULTS_MESSAGE });
  }

  const postIds = topMatches.map((match) => match.post_id);
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, image_path")
    .in("id", postIds);

  const postMetaById = new Map<string, PostMeta>();
  for (const post of (posts ?? []) as PostMeta[]) {
    postMetaById.set(post.id, post);
  }

  const results = topMatches
    .map((match) => {
      const meta = postMetaById.get(match.post_id);
      if (!meta) {
        return null;
      }
      const imageUrl = meta.image_path
        ? supabase.storage.from("post-images").getPublicUrl(meta.image_path).data.publicUrl
        : null;
      return {
        postId: meta.id,
        title: meta.title,
        imageUrl,
        excerpt: match.chunk_text,
        similarity: match.similarity,
      };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null);

  return NextResponse.json({ results });
}
