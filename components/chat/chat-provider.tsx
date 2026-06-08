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

// Núcleo del chatbot del lado cliente (fase 5). Vive una sola vez en el layout, así
// el estado se comparte entre el widget flotante y la página /chat y sobrevive a la
// navegación. El historial es efímero (no se persiste): el server es stateless.

export type ChatSource = {
  postId: string;
  title: string;
  imageUrl: string | null;
};

export type ChatUIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  status?: string | null;
  error?: string | null;
};

type StreamEvent =
  | { type: "status"; value: string }
  | { type: "token"; value: string }
  | { type: "sources"; value: ChatSource[] }
  | { type: "done"; hadResults: boolean }
  | { type: "error"; message: string };

type ChatContextValue = {
  messages: ChatUIMessage[];
  input: string;
  setInput: (value: string) => void;
  isStreaming: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  sendMessage: (text: string) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetConversation: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const MAX_RECORDING_MS = 60_000;

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseStreamEvent(raw: string): StreamEvent | null {
  const line = raw.split("\n").find((part) => part.startsWith("data:"));
  if (!line) {
    return null;
  }
  try {
    return JSON.parse(line.slice(5).trim()) as StreamEvent;
  } catch {
    return null;
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateMessage = useCallback((id: string, patch: Partial<ChatUIMessage>) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, ...patch } : message)));
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) {
        return;
      }

      const userMessage: ChatUIMessage = { id: createId(), role: "user", content: trimmed };
      const assistantId = createId();
      const assistantMessage: ChatUIMessage = { id: assistantId, role: "assistant", content: "" };

      // Historial que ve el server (incluye el nuevo turno, sin el placeholder).
      const history = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsStreaming(true);

      void (async () => {
        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: history }),
          });

          if (!response.ok || !response.body) {
            throw new Error(`chat request failed: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let answer = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });

            const segments = buffer.split("\n\n");
            buffer = segments.pop() ?? "";

            for (const segment of segments) {
              const event = parseStreamEvent(segment);
              if (!event) {
                continue;
              }

              if (event.type === "status") {
                updateMessage(assistantId, { status: event.value });
              } else if (event.type === "token") {
                answer += event.value;
                updateMessage(assistantId, { content: answer, status: null });
              } else if (event.type === "sources") {
                updateMessage(assistantId, { sources: event.value });
              } else if (event.type === "error") {
                updateMessage(assistantId, { error: event.message, status: null });
              } else if (event.type === "done") {
                updateMessage(assistantId, { status: null });
              }
            }
          }
        } catch (error) {
          console.error("Error streaming chat", error);
          updateMessage(assistantId, {
            error: "No se pudo conectar con el asistente. Intentá de nuevo.",
            status: null,
          });
        } finally {
          setIsStreaming(false);
        }
      })();
    },
    [isStreaming, messages, updateMessage],
  );

  const stopRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isStreaming) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("No se pudo acceder al micrófono", error);
      return;
    }

    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);

      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      if (chunks.length === 0) {
        return;
      }

      const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });

      void (async () => {
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "grabacion");
          const response = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (!response.ok) {
            throw new Error(`transcribe failed: ${response.status}`);
          }
          const data = (await response.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) {
            // Rellena el input para que el usuario revise y envíe manualmente.
            setInput((prev) => (prev ? `${prev} ${text}` : text));
          }
        } catch (error) {
          console.error("Error transcribiendo audio", error);
        } finally {
          setIsTranscribing(false);
        }
      })();
    };

    recorder.start();
    setIsRecording(true);
    recordingTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_MS);
  }, [isRecording, isStreaming, stopRecording]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    setInput("");
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      input,
      setInput,
      isStreaming,
      isRecording,
      isTranscribing,
      sendMessage,
      startRecording,
      stopRecording,
      resetConversation,
    }),
    [
      messages,
      input,
      isStreaming,
      isRecording,
      isTranscribing,
      sendMessage,
      startRecording,
      stopRecording,
      resetConversation,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat debe usarse dentro de <ChatProvider>");
  }
  return context;
}
