import "server-only";

import { publicServerClient } from "@/lib/supabase/public-server";
import { embedQuery } from "@/lib/ai/embeddings";

// Búsqueda semántica sobre la biblioteca. Núcleo compartido por /api/search (fase 4)
// y por la tool buscar_contenidos del chatbot (fase 5): la consulta se vectoriza con
// gemini-embedding-2 y se matchea contra content_chunks vía pgvector.

// Umbral de similitud coseno (1 = idéntico). Ajustable según datos reales (fase 7).
export const SIMILARITY_THRESHOLD = 0.5;
// Cantidad de chunks que pide la RPC antes de deduplicar por post.
const CHUNK_MATCH_COUNT = 12;
// Máximo de artículos devueltos tras deduplicar.
const MAX_RESULTS = 5;
export const MAX_QUERY_LENGTH = 1000;
export const NO_RESULTS_MESSAGE = "No hay contenido sobre eso.";

export type SearchResult = {
  postId: string;
  title: string;
  imageUrl: string | null;
  excerpt: string;
  similarity: number;
};

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

// Devuelve los artículos más similares a la consulta, deduplicados por post y
// ordenados por cercanía. Lanza si falla el embedding o la RPC.
export async function searchContent(query: string): Promise<SearchResult[]> {
  const queryEmbedding = await embedQuery(query);

  const supabase = publicServerClient;
  const { data: matches, error: matchError } = await supabase.rpc("match_content_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: CHUNK_MATCH_COUNT,
  });

  if (matchError) {
    throw new Error(`match_content_chunks failed: ${matchError.message}`);
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
    return [];
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

  return topMatches
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
    .filter((result): result is SearchResult => result !== null);
}
