"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2, Mic, Send, Square } from "lucide-react";
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import MarkdownRenderer from "@/components/markdown-renderer";
import { useChat, type ChatSource, type ChatUIMessage } from "@/components/chat/chat-provider";

// UI compartida del chatbot. La usan el widget flotante y la página /chat; ambos
// consumen el mismo useChat(), así que comparten estado y conversación.

const SUGGESTIONS = [
  "¿Qué es el aprendizaje por refuerzo?",
  "Explicame las redes neuronales convolucionales",
  "¿Cómo funcionan los transformers?",
];

function SourceCard({ source }: { source: ChatSource }) {
  return (
    <Link
      href={`/post/${source.postId}`}
      className="group flex items-center gap-3 rounded-xl border border-[var(--ghost-outline)] bg-[var(--surface-low)] p-2 transition hover:border-[var(--primary)]/50 hover:bg-[var(--surface-high)]"
    >
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-high)]">
        {source.imageUrl ? (
          <Image src={source.imageUrl} alt={source.title} fill className="object-cover" sizes="48px" />
        ) : null}
      </div>
      <span className="line-clamp-2 text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--primary)]">
        {source.title}
      </span>
    </Link>
  );
}

function MessageBubble({ message }: { message: ChatUIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--primary)]/15 px-4 py-2.5 text-[var(--foreground)]">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  const showThinking = !message.content && !message.error && !message.status;

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-[var(--surface-low)] px-4 py-3">
        {message.status ? (
          <p className="flex items-center gap-2 text-sm text-[var(--foreground)]/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {message.status}
          </p>
        ) : null}

        {showThinking ? (
          <p className="flex items-center gap-2 text-sm text-[var(--foreground)]/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Pensando…
          </p>
        ) : null}

        {message.content ? <MarkdownRenderer content={message.content} compact /> : null}

        {message.error ? (
          <p className="mt-2 text-sm text-red-400">{message.error}</p>
        ) : null}
      </div>

      {message.sources && message.sources.length > 0 ? (
        <div className="max-w-[92%]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
            Artículos recomendados para profundizar
          </p>
          <div className="grid gap-2">
            {message.sources.map((source) => (
              <SourceCard key={source.postId} source={source} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPanel({ className = "" }: { className?: string }) {
  const {
    messages,
    input,
    setInput,
    isStreaming,
    isRecording,
    isTranscribing,
    sendMessage,
    startRecording,
    stopRecording,
  } = useChat();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">Asistente de la biblioteca</p>
              <p className="mt-1 text-sm text-[var(--foreground)]/60">
                Preguntá sobre cualquier tema de IA. Respondo solo con artículos de la biblioteca.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-full border border-[var(--ghost-outline)] px-4 py-1.5 text-sm text-[var(--foreground)]/80 transition hover:border-[var(--primary)]/50 hover:text-[var(--primary)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--ghost-outline)] p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--ghost-outline)] bg-[var(--surface-low)] px-3 py-2 focus-within:border-[var(--primary)]/50">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder={isTranscribing ? "Transcribiendo audio…" : "Escribí tu pregunta…"}
            disabled={isTranscribing}
            className="max-h-32 flex-1 resize-none self-stretch bg-transparent py-1 text-sm leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--foreground)]/40 disabled:opacity-60"
          />

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isStreaming || isTranscribing}
            aria-label={isRecording ? "Detener grabación" : "Grabar pregunta por voz"}
            title={isRecording ? "Detener grabación" : "Grabar pregunta por voz"}
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isRecording
                ? "bg-red-500/20 text-red-400"
                : "text-[var(--foreground)]/70 hover:bg-[var(--surface-high)] hover:text-[var(--primary)]"
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          <button
            type="submit"
            disabled={isStreaming || isTranscribing || !input.trim()}
            aria-label="Enviar"
            title="Enviar"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--background)] transition hover:bg-[var(--primary-container)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {isRecording ? (
          <p className="mt-2 px-1 text-xs text-red-400">Grabando… tocá el cuadrado para terminar.</p>
        ) : null}
      </form>
    </div>
  );
}
