import "server-only";

import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import type { SearchResult } from "@/lib/ai/search";
import { NO_RESULTS_MESSAGE } from "@/lib/ai/search";

// Núcleo del chatbot (fase 5): cliente Gemini, system prompt y declaración de la
// tool. SIN temperature: Gemini 3 exige el default 1.0 (bajarla puede causar loops).
const DEFAULT_CHAT_MODEL = "gemini-3.1-flash-lite";

export const SEARCH_TOOL_NAME = "buscar_contenidos";

// Mensaje del cliente (historial efímero). El server es stateless: recibe todo el
// historial en cada turno y no persiste transcripts.
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Eventos del stream SSE hacia el cliente.
export type ChatStreamEvent =
  | { type: "status"; value: string }
  | { type: "token"; value: string }
  | { type: "sources"; value: ChatSource[] }
  | { type: "trim"; chars: number }
  | { type: "done"; hadResults: boolean }
  | { type: "error"; message: string };

// Tarjeta de fuente que se muestra al usuario. Se arma en el server desde los
// resultados reales de la búsqueda (nunca la inventa el modelo).
export type ChatSource = {
  postId: string;
  title: string;
  imageUrl: string | null;
};

const SYSTEM_PROMPT = [
  "Eres el asistente del Repositorio de Sistemas Inteligentes, una biblioteca curada de artículos sobre inteligencia artificial.",
  "Respondes SIEMPRE en español, con tono claro y neutral.",
  "",
  "Reglas de grounding (estrictas):",
  `- Ante cualquier pregunta sobre temas de IA o sobre el contenido de la biblioteca, DEBES llamar a la herramienta ${SEARCH_TOOL_NAME} antes de responder. No respondas de memoria.`,
  "- Responde ÚNICAMENTE con la información contenida en los fragmentos que devuelve la herramienta. No agregues conocimiento externo ni inventes datos.",
  "- Ofrece siempre un resumen breve y directo de la información relevante. No transcribas ni reproduzcas el artículo o fragmento entero del que estás citando; tu objetivo es resumir y sintetizar.",
  `- Si la herramienta no devuelve fragmentos, responde exactamente: "${NO_RESULTS_MESSAGE}" y no intentes responder con conocimiento general.`,
  "- No menciones la herramienta, los fragmentos ni el proceso interno; responde de forma natural.",
  "- No incluyas citas numéricas tipo [1]: las fuentes se muestran aparte como tarjetas.",
  "",
  "Selección de artículos relevantes:",
  "- Cada fragmento que recibes tiene un campo 'id' que identifica al artículo.",
  "- Después de tu respuesta, SIEMPRE incluí una línea final con el formato exacto: <refs>id1,id2</refs> listando SOLO los IDs de artículos cuyo contenido usaste o que realmente responden la pregunta del usuario.",
  "- Si ningún fragmento es relevante, escribí <refs></refs> vacío.",
  "- NO incluyas artículos que solo mencionan el tema de pasada o que no aportan a la respuesta.",
  "",
  "Para saludos o mensajes que no son preguntas de contenido (p. ej. \"hola\", \"gracias\"), responde con naturalidad y brevedad sin usar la herramienta.",
].join("\n");

export const searchToolDeclaration: FunctionDeclaration = {
  name: SEARCH_TOOL_NAME,
  description:
    "Busca artículos relevantes en la biblioteca de IA por similitud semántica. Úsala para responder cualquier pregunta sobre contenidos, conceptos o temas de inteligencia artificial.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      consulta: {
        type: Type.STRING,
        description:
          "La consulta de búsqueda en español, reformulada de forma autónoma y específica a partir de la pregunta del usuario y el contexto de la conversación.",
      },
    },
    required: ["consulta"],
  },
};

export function getChatClient(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");
  }

  const model = process.env.GEMINI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
  return { ai: new GoogleGenAI({ apiKey }), model };
}

export function getChatConfig() {
  return {
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: [searchToolDeclaration] }],
  };
}

// Convierte el historial del cliente al formato de contents de Gemini.
export function toGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

// Vista de los resultados que recibe el modelo en el functionResponse: título,
// fragmento e id del artículo para que el modelo pueda referenciar cuáles son
// realmente relevantes en su tag <refs>.
export function toModelView(results: SearchResult[]): Array<{ id: string; titulo: string; fragmento: string }> {
  return results.map((result) => ({ id: result.postId, titulo: result.title, fragmento: result.excerpt }));
}

// Tarjetas para el cliente: armadas desde los resultados reales.
export function toSources(results: SearchResult[]): ChatSource[] {
  return results.map((result) => ({
    postId: result.postId,
    title: result.title,
    imageUrl: result.imageUrl,
  }));
}

// Parsea el tag <refs>id1,id2,...</refs> del final de la respuesta del modelo y
// devuelve los IDs seleccionados. Si no hay tag, devuelve null (fallback a todos).
const REFS_REGEX = /<refs>([\s\S]*?)<\/refs>\s*$/;

export function parseSelectedRefs(answer: string): { cleanAnswer: string; selectedIds: string[] | null } {
  const match = answer.match(REFS_REGEX);
  if (!match) {
    return { cleanAnswer: answer, selectedIds: null };
  }

  const rawIds = match[1].trim();
  const selectedIds = rawIds
    ? rawIds.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  const cleanAnswer = answer.slice(0, match.index).trimEnd();
  return { cleanAnswer, selectedIds };
}

// Filtra las sources según la selección del modelo. Si selectedIds es null
// (el modelo no incluyó el tag), devuelve todas como fallback.
export function filterSourcesBySelection(
  results: SearchResult[],
  selectedIds: string[] | null,
): ChatSource[] {
  const allSources = toSources(results);
  if (!selectedIds) {
    return allSources;
  }
  if (selectedIds.length === 0) {
    return [];
  }
  const idSet = new Set(selectedIds);
  return allSources.filter((source) => idSet.has(source.postId));
}
