import "server-only";

import { GoogleGenAI, Modality, type LiveConnectConfig } from "@google/genai";
import { NO_RESULTS_MESSAGE } from "@/lib/ai/search";
import { SEARCH_TOOL_NAME, searchToolDeclaration } from "@/lib/ai/chat";

// Núcleo (server) del asistente de SOLO VOZ (fase 6): usa la Gemini Live API por
// WebSocket. A diferencia del chatbot de texto, el navegador abre el WS DIRECTO a
// Gemini con un token efímero que este módulo ayuda a emitir; el audio nunca pasa
// por nuestro server. Reusa la misma tool buscar_contenidos para grounding.
//
// Modelo native audio (genera el audio directamente, más natural/cálido). SIN
// temperature, coherente con Gemini 3 (ver lib/ai/chat.ts). El ID del modelo y la
// voz son configurables por env porque los modelos Live están en preview y rotan.

const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";
const DEFAULT_VOICE = "Aoede"; // voz cálida/cercana; configurable por env.
const LANGUAGE_CODE = "es-US";

// La Live API y los tokens efímeros viven en la superficie v1alpha.
const LIVE_API_VERSION = "v1alpha";

// Reusamos la declaración de la tool del chatbot de texto: misma búsqueda semántica.
export { SEARCH_TOOL_NAME };

const SYSTEM_PROMPT = [
  "Eres el asistente de voz del Repositorio de Sistemas Inteligentes, una biblioteca curada de artículos sobre inteligencia artificial.",
  "Hablas SIEMPRE en español rioplatense, con un tono cálido, cercano y natural, como en una conversación hablada. Frases breves; evitá enumeraciones largas o tecnicismos innecesarios al hablar.",
  "",
  "Grounding (importante, pero conversacional):",
  `- Ante preguntas sobre temas de IA o sobre el contenido de la biblioteca, llamá a la herramienta ${SEARCH_TOOL_NAME} y basá tu respuesta en lo que devuelve. No inventes datos del corpus.`,
  "- Ofrecé siempre un resumen muy breve y directo de la información útil. No transcribas ni repitas el fragmento o el artículo entero del que estás citando; tu objetivo es resumir y sintetizar.",
  `- Si la herramienta no devuelve fragmentos útiles, o los que devuelve no responden lo que se preguntó, comenzá tu respuesta exactamente con la frase "${NO_RESULTS_MESSAGE}" y después, con naturalidad, ofrecé reformular o sugerí un tema cercano. No improvises contenido que no esté en la biblioteca.`,
  "- No menciones la herramienta ni el proceso interno; respondé de forma natural.",
  "- No leas URLs ni códigos en voz alta: los artículos relacionados se muestran en pantalla como tarjetas.",
  "",
  "Para saludos, agradecimientos o charla breve, respondé con calidez y naturalidad sin usar la herramienta.",
  "Al iniciar la conversación, saludá en una sola frase corta e invitá a la persona a preguntar sobre algún tema de la biblioteca.",
].join("\n");

// Config de la sesión Live. Se fija en el token efímero (liveConnectConstraints),
// de modo que el cliente no puede alterar el system prompt ni las tools.
export function buildLiveConfig(voice: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: [searchToolDeclaration] }],
    speechConfig: {
      languageCode: LANGUAGE_CODE,
      voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
    },
    // Voz cálida y expresiva: deja que el modelo adapte el tono a la conversación.
    enableAffectiveDialog: true,
    // Comprime el contexto para sostener sesiones más largas sin cortar por límite.
    contextWindowCompression: { slidingWindow: {} },
    // Transcripción de salida SOLO para uso interno: el panel no muestra subtítulos
    // (decisión fase 6), pero el cliente la usa para decidir si muestra las tarjetas
    // (si el modelo dijo "no hay contenido", no se muestran), igual que el chat de texto.
    outputAudioTranscription: {},
  };
}

export function getVoiceModel(): string {
  return process.env.GEMINI_LIVE_MODEL?.trim() || DEFAULT_LIVE_MODEL;
}

export function getVoiceName(): string {
  return process.env.GEMINI_LIVE_VOICE?.trim() || DEFAULT_VOICE;
}

export function getLiveClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");
  }
  return new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
}

export { LIVE_API_VERSION };
