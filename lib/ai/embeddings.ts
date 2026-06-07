import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

// gemini-embedding-2 ("embedding 002"): no admite taskType; las instrucciones de
// tarea van como prefijo en el texto. Auto-normaliza las dimensiones truncadas
// (768), así que el coseno funciona sin normalizar a mano.
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;
const MAX_GENERATION_ATTEMPTS = 2;

// Chunking por secciones: respeta encabezados/párrafos, sin solape.
const CHUNK_MAX_WORDS = 500;
const CHUNK_MIN_WORDS = 300;
// Tope de chunks por llamada a embedContent (presupuesto de tokens del request).
const EMBED_BATCH_SIZE = 50;

type EmbeddingsStatus = "pending" | "generating" | "ready" | "failed";

type ContentChunk = {
  heading: string | null;
  text: string;
};

type GeneratePostEmbeddingsParams = {
  supabase: SupabaseClient;
  postId: string;
  title: string;
  content: string;
  force?: boolean;
};

function getGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");
  }

  const model = process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  return { ai: new GoogleGenAI({ apiKey }), model };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Divide el Markdown en chunks de ~300-500 palabras sin partir párrafos. Cada
// encabezado abre una sección nueva (cierra el chunk en curso) y queda registrado
// como contexto del chunk para enriquecer el embedding.
export function chunkContent(content: string): ContentChunk[] {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks: ContentChunk[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  let bufferWords = 0;
  let bufferHeading: string | null = null;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    chunks.push({ heading: bufferHeading, text: buffer.join("\n\n") });
    buffer = [];
    bufferWords = 0;
  };

  for (const block of blocks) {
    const headingMatch = block.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].trim() || null;
      continue;
    }

    if (buffer.length === 0) {
      bufferHeading = currentHeading;
    }

    const blockWords = countWords(block);
    if (bufferWords > 0 && bufferWords + blockWords > CHUNK_MAX_WORDS && bufferWords >= CHUNK_MIN_WORDS) {
      flush();
      bufferHeading = currentHeading;
    }

    buffer.push(block);
    bufferWords += blockWords;
  }

  flush();
  return chunks;
}

// Documento a indexar: prefijo recomendado por gemini-embedding-2.
function buildDocumentInput(title: string, chunk: ContentChunk): string {
  const safeTitle = title.trim() || "none";
  const textPart = chunk.heading ? `${chunk.heading}\n\n${chunk.text}` : chunk.text;
  return `title: ${safeTitle} | text: ${textPart}`;
}

async function embedInputs(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  const { ai, model } = getGeminiClient();
  const vectors: number[][] = [];

  for (let start = 0; start < inputs.length; start += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(start, start + EMBED_BATCH_SIZE);
    const response = await ai.models.embedContent({
      model,
      // Cada input como Content separado -> un embedding por input (un array de
      // strings planos devolvería UN solo embedding agregado).
      contents: batch.map((text) => ({ parts: [{ text }] })),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });

    const batchEmbeddings = response.embeddings ?? [];
    if (batchEmbeddings.length !== batch.length) {
      throw new Error(
        `Gemini returned ${batchEmbeddings.length} embeddings for ${batch.length} inputs`,
      );
    }

    for (const embedding of batchEmbeddings) {
      const values = embedding.values ?? [];
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Gemini returned embedding with ${values.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
      }
      vectors.push(values);
    }
  }

  return vectors;
}

// Embedding de una consulta de búsqueda (prefijo de query de gemini-embedding-2).
// Usado por /api/search.
export async function embedQuery(query: string): Promise<number[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Empty query");
  }

  const [vector] = await embedInputs([`task: search result | query: ${trimmed}`]);
  if (!vector) {
    throw new Error("Gemini returned empty query embedding");
  }
  return vector;
}

async function updateEmbeddingsState({
  supabase,
  postId,
  status,
  attempts,
  chunksCount,
}: {
  supabase: SupabaseClient;
  postId: string;
  status: EmbeddingsStatus;
  attempts: number;
  chunksCount?: number;
}) {
  const updatePayload: {
    embeddings_status: EmbeddingsStatus;
    embeddings_attempts: number;
    chunks_count?: number;
    embeddings_generated_at?: string | null;
  } = {
    embeddings_status: status,
    embeddings_attempts: attempts,
  };

  if (status === "ready") {
    updatePayload.chunks_count = chunksCount ?? 0;
    updatePayload.embeddings_generated_at = new Date().toISOString();
  }

  if (status === "failed") {
    updatePayload.embeddings_generated_at = null;
  }

  await supabase.from("posts").update(updatePayload).eq("id", postId);
}

// Genera (o regenera) los chunks + embeddings de un post. Borra los chunks viejos
// y reinserta. Espeja el patrón de generatePostSummary: reintentos + estado en
// posts. Pensada para correr dentro de after() (creación) o desde la server action
// del botón "regenerar embeddings".
export async function generatePostEmbeddings({
  supabase,
  postId,
  title,
  content,
  force = false,
}: GeneratePostEmbeddingsParams): Promise<void> {
  if (!title.trim() || !content.trim()) {
    return;
  }

  const { data: existingPost } = await supabase
    .from("posts")
    .select("id, embeddings_status, chunks_count")
    .eq("id", postId)
    .maybeSingle();

  if (!existingPost) {
    return;
  }

  const isReady = existingPost.embeddings_status === "ready" && (existingPost.chunks_count ?? 0) > 0;
  if (!force && isReady) {
    return;
  }

  const chunks = chunkContent(content);

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    await updateEmbeddingsState({ supabase, postId, status: "generating", attempts: attempt });

    try {
      const vectors = await embedInputs(chunks.map((chunk) => buildDocumentInput(title, chunk)));

      // Reemplazo atómico desde la perspectiva del lector: borrar y reinsertar.
      const { error: deleteError } = await supabase.from("content_chunks").delete().eq("post_id", postId);
      if (deleteError) {
        throw new Error(`Failed to clear old chunks: ${deleteError.message}`);
      }

      if (chunks.length > 0) {
        const rows = chunks.map((chunk, index) => ({
          post_id: postId,
          chunk_index: index,
          chunk_text: chunk.text,
          embedding: vectors[index],
        }));

        const { error: insertError } = await supabase.from("content_chunks").insert(rows);
        if (insertError) {
          throw new Error(`Failed to insert chunks: ${insertError.message}`);
        }
      }

      await updateEmbeddingsState({
        supabase,
        postId,
        status: "ready",
        attempts: attempt,
        chunksCount: chunks.length,
      });
      return;
    } catch (error) {
      console.error("Error generating post embeddings", {
        postId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        await updateEmbeddingsState({ supabase, postId, status: "failed", attempts: attempt });
      }
    }
  }
}
