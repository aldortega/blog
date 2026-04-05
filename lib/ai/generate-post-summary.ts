import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_GENERATION_ATTEMPTS = 2;

type SummaryStatus = "pending" | "generating" | "ready" | "failed";

type GeneratePostSummaryParams = {
  supabase: SupabaseClient;
  postId: string;
  title: string;
  content: string;
  force?: boolean;
};

function normalizeSummary(summary: string): string {
  return summary.replace(/\s+/g, " ").trim();
}

function buildPrompt({ title, content }: { title: string; content: string }): string {
  return [
    "Escribe un resumen en espanol, en un solo parrafo corto.",
    "Se permite Markdown (como **negrita** o *cursiva*), pero no uses listas, titulos ni bloques.",
    "No inventes datos ni agregues informacion externa.",
    "Tono claro y neutral.",
    "",
    `Titulo: ${title}`,
    "Contenido del post:",
    content,
  ].join("\n");
}

function extractSummaryText(response: { text?: string | null; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }): string {
  const plainText = normalizeSummary(response.text ?? "");
  if (plainText) {
    return plainText;
  }

  const fallback = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join(" ");

  return normalizeSummary(fallback);
}

async function requestSummaryFromGemini({ title, content }: { title: string; content: string }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: buildPrompt({ title, content }),
    config: {
      temperature: 0.3,
      maxOutputTokens: 900,
    },
  });

  const summary = extractSummaryText(response);
  if (!summary) {
    throw new Error("Gemini returned empty summary");
  }

  return summary;
}

async function updateSummaryState({
  supabase,
  postId,
  status,
  attempts,
  summary,
}: {
  supabase: SupabaseClient;
  postId: string;
  status: SummaryStatus;
  attempts: number;
  summary?: string | null;
}) {
  const updatePayload: {
    ai_summary_status: SummaryStatus;
    ai_summary_attempts: number;
    ai_summary?: string | null;
    ai_summary_generated_at?: string | null;
  } = {
    ai_summary_status: status,
    ai_summary_attempts: attempts,
  };

  if (status === "ready") {
    updatePayload.ai_summary = summary ?? null;
    updatePayload.ai_summary_generated_at = new Date().toISOString();
  }

  if (status === "failed") {
    updatePayload.ai_summary_generated_at = null;
  }

  await supabase.from("posts").update(updatePayload).eq("id", postId);
}

export async function generatePostSummary({
  supabase,
  postId,
  title,
  content,
  force = false,
}: GeneratePostSummaryParams): Promise<void> {
  if (!title.trim() || !content.trim()) {
    return;
  }

  const { data: existingPost } = await supabase
    .from("posts")
    .select("id, ai_summary, ai_summary_status")
    .eq("id", postId)
    .maybeSingle();

  if (!existingPost) {
    return;
  }

  const hasSummary = typeof existingPost.ai_summary === "string" && existingPost.ai_summary.trim().length > 0;
  if (!force && (hasSummary || existingPost.ai_summary_status === "ready")) {
    return;
  }

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    await updateSummaryState({
      supabase,
      postId,
      status: "generating",
      attempts: attempt,
    });

    try {
      const summary = await requestSummaryFromGemini({ title, content });
      await updateSummaryState({
        supabase,
        postId,
        status: "ready",
        attempts: attempt,
        summary,
      });
      return;
    } catch (error) {
      console.error("Error generating post summary", {
        postId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        await updateSummaryState({
          supabase,
          postId,
          status: "failed",
          attempts: attempt,
          summary: null,
        });
      }
    }
  }
}
