import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_GENERATION_ATTEMPTS = 2;
const MIN_SUMMARY_WORDS = 14;
const MIN_SUMMARY_CHARS = 90;

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
    "Eres editor de un blog de cine.",
    "Escribe un resumen en espanol, en un solo parrafo de 2 a 4 oraciones.",
    "Se permite Markdown inline (como **negrita** o *cursiva*), pero no uses listas, titulos ni bloques.",
    "No inventes datos ni agregues informacion externa.",
    "Tono claro y neutral.",
    "",
    `Titulo: ${title}`,
    "Contenido del post:",
    content,
  ].join("\n");
}

function isCompleteSummary(summary: string): boolean {
  const normalized = normalizeSummary(summary);
  if (!normalized) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length < MIN_SUMMARY_WORDS || normalized.length < MIN_SUMMARY_CHARS) {
    return false;
  }

  return /[.!?]"?$/.test(normalized);
}

async function requestSummaryFromGemini({ title, content }: { title: string; content: string }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
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

  const summary = normalizeSummary(response.text ?? "");
  const finishReason = response.candidates?.[0]?.finishReason;
  const incompleteFinishReason = finishReason === "MAX_TOKENS" || finishReason === "FINISH_REASON_UNSPECIFIED";

  if (!isCompleteSummary(summary)) {
    throw new Error("Gemini returned an incomplete summary");
  }

  if (incompleteFinishReason && !/[.!?]"?$/.test(summary)) {
    throw new Error(`Gemini returned incomplete output (${finishReason})`);
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
    } catch {
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
