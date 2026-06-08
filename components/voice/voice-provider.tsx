"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { AudioPlayer, AudioRecorder, INPUT_SAMPLE_RATE } from "@/lib/voice/audio";

// Núcleo (cliente) del asistente de SOLO VOZ (fase 6). Abre el WebSocket DIRECTO a la
// Gemini Live API con un token efímero que pide a /api/voice/token, transmite el
// micrófono y reproduce la voz del modelo. Cuando el modelo pide buscar_contenidos,
// el function call llega acá: ejecutamos /api/voice/search, devolvemos los fragmentos
// por el WS y mostramos las tarjetas. Audio nunca pasa por nuestro server.

const SEARCH_TOOL_NAME = "buscar_contenidos";
const INPUT_MIME = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`;
// Marcador (en minúsculas) que el modelo emite cuando no hay contenido relevante.
// Si aparece en la transcripción del turno, NO mostramos tarjetas (paridad con el
// chat de texto, que hace el mismo chequeo sobre su respuesta).
const NO_RESULTS_MARKER = "no hay contenido";

// Guardrails de costo (native audio es caro; proyecto académico).
const HARD_CAP_MS = 5 * 60_000; // tope duro de sesión.
const INACTIVITY_MS = 60_000; // corte si no se detecta voz por este tiempo.
const INACTIVITY_CHECK_MS = 5_000;

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceSource = {
  postId: string;
  title: string;
  imageUrl: string | null;
};

type VoiceContextValue = {
  status: VoiceStatus;
  isActive: boolean;
  sources: VoiceSource[];
  error: string | null;
  notice: string | null;
  start: () => Promise<void>;
  stop: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

type SearchResponse = {
  forModel: Array<{ titulo: string; fragmento: string }>;
  sources: VoiceSource[];
  hadResults: boolean;
};

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [sources, setSources] = useState<VoiceSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const hardCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVoiceRef = useRef<number>(0);
  // Tarjetas candidatas del turno en curso: se confirman al terminar el turno solo
  // si el modelo NO dijo "no hay contenido" (lo sabemos por la transcripción interna).
  const pendingSourcesRef = useRef<VoiceSource[]>([]);
  const transcriptRef = useRef("");
  // Evita condiciones de carrera entre stop() y callbacks asíncronos del WS.
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (hardCapRef.current) {
      clearTimeout(hardCapRef.current);
      hardCapRef.current = null;
    }
    if (inactivityRef.current) {
      clearInterval(inactivityRef.current);
      inactivityRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    activeRef.current = false;
    clearTimers();
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // sesión ya cerrada
    }
    sessionRef.current = null;
  }, [clearTimers]);

  const stop = useCallback(() => {
    if (!activeRef.current && status === "idle") {
      return;
    }
    teardown();
    setStatus("idle");
  }, [status, teardown]);

  const endWithNotice = useCallback(
    (message: string) => {
      teardown();
      setStatus("idle");
      setNotice(message);
    },
    [teardown],
  );

  // Ejecuta el function call buscar_contenidos contra el endpoint autenticado y
  // devuelve los fragmentos al modelo; junta las tarjetas para la UI.
  const runSearchTool = useCallback(
    async (call: { id?: string; name?: string; args?: Record<string, unknown> }) => {
      const session = sessionRef.current;
      if (!session) return;

      const consulta = typeof call.args?.consulta === "string" ? call.args.consulta.trim() : "";
      setStatus("thinking");

      let response: SearchResponse | null = null;
      if (consulta) {
        try {
          const res = await fetch("/api/voice/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: consulta }),
          });
          if (res.ok) {
            response = (await res.json()) as SearchResponse;
          }
        } catch (err) {
          console.error("Error en la búsqueda de voz", err);
        }
      }

      if (!activeRef.current) return;

      if (response?.sources?.length) {
        // Guardamos como candidatas; se confirman al cierre del turno (ver
        // handleMessage), no acá: todavía no sabemos si el modelo las usará.
        const pending = pendingSourcesRef.current;
        const seen = new Set(pending.map((s) => s.postId));
        for (const source of response.sources) {
          if (!seen.has(source.postId)) pending.push(source);
        }
      }

      session.sendToolResponse({
        functionResponses: [
          {
            id: call.id,
            name: call.name ?? SEARCH_TOOL_NAME,
            response: response
              ? { resultados: response.forModel }
              : { error: "La búsqueda no está disponible en este momento." },
          },
        ],
      });
    },
    [],
  );

  const handleMessage = useCallback(
    (message: LiveServerMessage) => {
      if (!activeRef.current) return;
      const player = playerRef.current;

      // Barge-in: el usuario interrumpió; vaciamos la reproducción y descartamos las
      // tarjetas candidatas del turno cortado (no llegó a confirmarse la respuesta).
      if (message.serverContent?.interrupted) {
        player?.clear();
        pendingSourcesRef.current = [];
        transcriptRef.current = "";
        setStatus("listening");
      }

      // Audio de la respuesta del modelo.
      const parts = message.serverContent?.modelTurn?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith("audio/")) {
          const rateMatch = part.inlineData.mimeType.match(/rate=(\d+)/);
          const rate = rateMatch ? Number(rateMatch[1]) : undefined;
          player?.enqueue(data, rate);
          setStatus("speaking");
        }
      }

      // Transcripción de salida (uso interno, no se muestra): la acumulamos para
      // decidir al final del turno si mostramos las tarjetas.
      const outText = message.serverContent?.outputTranscription?.text;
      if (outText) {
        transcriptRef.current += outText;
      }

      // Function call: el modelo pide buscar en la biblioteca.
      const calls = message.toolCall?.functionCalls;
      if (calls?.length) {
        for (const call of calls) {
          if (call.name === SEARCH_TOOL_NAME) {
            void runSearchTool(call);
          }
        }
      }

      if (message.serverContent?.turnComplete) {
        const transcript = transcriptRef.current.toLowerCase();
        const pending = pendingSourcesRef.current;
        const saidNoContent = transcript.includes(NO_RESULTS_MARKER);

        if (saidNoContent) {
          // El modelo dijo que no hay contenido: descartamos las candidatas.
          pendingSourcesRef.current = [];
          transcriptRef.current = "";
        } else if (pending.length > 0 && transcript.trim().length > 0) {
          // El turno produjo una respuesta hablada que sí usó la búsqueda: confirmamos.
          setSources((prev) => {
            const seen = new Set(prev.map((s) => s.postId));
            const merged = [...prev];
            for (const source of pending) {
              if (!seen.has(source.postId)) merged.push(source);
            }
            return merged;
          });
          pendingSourcesRef.current = [];
          transcriptRef.current = "";
        } else {
          // Turno sin respuesta hablada todavía (p. ej. solo el function call):
          // mantenemos las candidatas y reseteamos el buffer de transcripción.
          transcriptRef.current = "";
        }
        setStatus("listening");
      }
    },
    [runSearchTool],
  );

  const start = useCallback(async () => {
    if (activeRef.current || status === "connecting") {
      return;
    }
    setError(null);
    setNotice(null);
    setSources([]);
    pendingSourcesRef.current = [];
    transcriptRef.current = "";
    setStatus("connecting");
    activeRef.current = true;

    let token: string;
    let model: string;
    try {
      const res = await fetch("/api/voice/token", { method: "POST" });
      if (!res.ok) {
        throw new Error(`token request failed: ${res.status}`);
      }
      ({ token, model } = (await res.json()) as { token: string; model: string });
    } catch (err) {
      console.error("No se pudo obtener el token de voz", err);
      activeRef.current = false;
      setStatus("error");
      setError("No se pudo iniciar el asistente de voz. Intentá de nuevo.");
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
      const player = new AudioPlayer();
      playerRef.current = player;

      const session = await ai.live.connect({
        model,
        callbacks: {
          onmessage: handleMessage,
          onerror: (event) => {
            console.error("Error en la sesión Live", event);
            if (activeRef.current) {
              teardown();
              setStatus("error");
              setError("Se interrumpió la conexión de voz.");
            }
          },
          onclose: () => {
            if (activeRef.current) {
              teardown();
              setStatus("idle");
            }
          },
        },
      });
      sessionRef.current = session;

      // Micrófono → Live API. La detección de voz alimenta el corte por inactividad.
      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      lastVoiceRef.current = Date.now();
      await recorder.start({
        onChunk: (base64) => {
          if (!activeRef.current) return;
          sessionRef.current?.sendRealtimeInput({ audio: { data: base64, mimeType: INPUT_MIME } });
        },
        onVoiceActivity: (voiced) => {
          if (voiced) lastVoiceRef.current = Date.now();
        },
      });

      if (!activeRef.current) {
        // stop() corrió mientras conectábamos.
        teardown();
        return;
      }

      setStatus("listening");

      // Guardrails: tope duro + corte por inactividad.
      hardCapRef.current = setTimeout(() => {
        endWithNotice("La sesión de voz se cerró al alcanzar el tiempo máximo.");
      }, HARD_CAP_MS);
      inactivityRef.current = setInterval(() => {
        if (Date.now() - lastVoiceRef.current > INACTIVITY_MS) {
          endWithNotice("La sesión de voz se cerró por inactividad.");
        }
      }, INACTIVITY_CHECK_MS);
    } catch (err) {
      console.error("No se pudo abrir la sesión de voz", err);
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      teardown();
      setStatus("error");
      setError(
        denied
          ? "Necesito permiso para usar el micrófono."
          : "No se pudo abrir la sesión de voz. Intentá de nuevo.",
      );
    }
  }, [status, handleMessage, teardown, endWithNotice]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      status,
      isActive: status !== "idle" && status !== "error",
      sources,
      error,
      notice,
      start,
      stop,
    }),
    [status, sources, error, notice, start, stop],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoice debe usarse dentro de <VoiceProvider>");
  }
  return context;
}
