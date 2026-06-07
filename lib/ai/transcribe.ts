import "server-only";

import { GoogleGenAI } from "@google/genai";

// Transcripción de voz para la entrada por audio del chatbot (fase 5). Usa Gemini
// multimodal con el audio como inlineData. SIN temperature: Gemini 3 exige el
// default 1.0 (bajarla puede causar loops/degradación).
const DEFAULT_TRANSCRIBE_MODEL = "gemini-3.1-flash-lite";

// Formatos de audio inline que acepta Gemini. MediaRecorder produce webm/opus en
// Chrome y mp4/aac en Safari; mapeamos a lo que la API entiende.
const SUPPORTED_AUDIO_PREFIXES = ["audio/"];

const TRANSCRIBE_PROMPT = [
  "Transcribe el siguiente audio al español.",
  "Devuelve únicamente el texto transcrito, sin comentarios, sin comillas y sin prefijos.",
  "Si el audio está vacío o es ininteligible, devuelve una cadena vacía.",
].join(" ");

function getGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");
  }

  const model = process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL;
  return { ai: new GoogleGenAI({ apiKey }), model };
}

export function isSupportedAudioType(mimeType: string): boolean {
  return SUPPORTED_AUDIO_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

// Transcribe un audio (buffer + mimeType real del blob). Devuelve el texto plano.
export async function transcribeAudio(audio: ArrayBuffer, mimeType: string): Promise<string> {
  const { ai, model } = getGeminiClient();
  const base64 = Buffer.from(audio).toString("base64");

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });

  return (response.text ?? "").trim();
}
