import { createClient } from "@/lib/supabase/server";
import type { FunctionCall, Part } from "@google/genai";
import { searchContent, NO_RESULTS_MESSAGE } from "@/lib/ai/search";
import {
  type ChatMessage,
  type ChatStreamEvent,
  getChatClient,
  getChatConfig,
  SEARCH_TOOL_NAME,
  toGeminiContents,
  toModelView,
  toSources,
} from "@/lib/ai/chat";

// Chatbot grounded en la biblioteca (fase 5). Streaming SSE con function calling:
// el modelo decide llamar a buscar_contenidos; ejecutamos la búsqueda, le devolvemos
// los fragmentos y streameamos la respuesta final. Gateado a login.

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;

type ChatRequestBody = {
  messages?: unknown;
};

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) {
    return null;
  }

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return null;
    }
    messages.push({ role, content });
  }

  // El último mensaje debe ser del usuario (es el turno a responder).
  if (messages[messages.length - 1]?.role !== "user") {
    return null;
  }

  return messages;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "No autenticado." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Cuerpo inválido. Se espera JSON { messages }." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = parseMessages(body.messages);
  if (!messages) {
    return new Response(JSON.stringify({ error: "Historial de mensajes inválido." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const { ai, model } = getChatClient();
        const config = getChatConfig();
        const contents = toGeminiContents(messages);

        // --- Vuelta 1: el modelo decide si llama la tool ---------------------
        const firstStream = await ai.models.generateContentStream({ model, contents, config });

        // Acumulamos los parts del modelo tal cual: Gemini 3 adjunta un
        // thoughtSignature en el part del functionCall que DEBE devolverse intacto
        // en la vuelta 2 (si se reconstruye el part, la API responde 400).
        const modelParts: Part[] = [];
        let functionCall: FunctionCall | null = null;
        let directText = "";

        for await (const chunk of firstStream) {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (!parts) {
            continue;
          }
          for (const part of parts) {
            modelParts.push(part);
            if (part.functionCall) {
              functionCall = part.functionCall;
            } else if (part.text) {
              directText += part.text;
            }
          }
        }

        // Sin tool: respuesta directa (saludos, agradecimientos). No se registra.
        if (!functionCall || functionCall.name !== SEARCH_TOOL_NAME) {
          if (directText) {
            send({ type: "token", value: directText });
          }
          send({ type: "done", hadResults: false });
          controller.close();
          return;
        }

        // --- Ejecutar la búsqueda -------------------------------------------
        send({ type: "status", value: "Buscando en la biblioteca…" });

        const consulta =
          typeof functionCall.args?.consulta === "string" ? functionCall.args.consulta.trim() : "";

        let toolErrored = false;
        let results: Awaited<ReturnType<typeof searchContent>> = [];
        if (consulta) {
          try {
            results = await searchContent(consulta);
          } catch (error) {
            toolErrored = true;
            console.error("Error in chatbot search tool", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const hadResults = results.length > 0;

        // Registrar la consulta para la analítica de gaps (solo turnos con búsqueda).
        if (consulta && !toolErrored) {
          const { error: logError } = await supabase
            .from("chatbot_queries")
            .insert({ user_id: user.id, query: consulta, had_results: hadResults, channel: "text" });
          if (logError) {
            console.error("Error logging chatbot query", { error: logError.message });
          }
        }

        // --- Vuelta 2: respuesta final anclada a los fragmentos -------------
        const toolResponse = toolErrored
          ? { error: "La búsqueda no está disponible en este momento." }
          : { resultados: toModelView(results) };

        const followUpContents = [
          ...contents,
          // Parts del modelo intactos (preservan el thoughtSignature del functionCall).
          { role: "model", parts: modelParts },
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: functionCall.name,
                  id: functionCall.id,
                  response: toolResponse,
                },
              },
            ],
          },
        ];

        const secondStream = await ai.models.generateContentStream({
          model,
          contents: followUpContents,
          config,
        });

        let answer = "";
        for await (const chunk of secondStream) {
          if (chunk.text) {
            answer += chunk.text;
            send({ type: "token", value: chunk.text });
          }
        }

        // Tarjetas solo si hubo resultados Y el modelo no respondió "no hay contenido"
        // (la búsqueda puede traer chunks flojos sobre el umbral que el modelo
        // descarta; en ese caso no mostramos artículos para no contradecir el texto).
        const saidNoContent = answer
          .toLowerCase()
          .includes(NO_RESULTS_MESSAGE.toLowerCase().replace(/\.$/, ""));
        if (hadResults && !saidNoContent) {
          send({ type: "sources", value: toSources(results) });
        }

        send({ type: "done", hadResults });
        controller.close();
      } catch (error) {
        console.error("Error in chat stream", {
          error: error instanceof Error ? error.message : String(error),
        });
        send({ type: "error", message: "Se interrumpió la respuesta. Intentá de nuevo." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
