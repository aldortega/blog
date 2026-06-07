"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2, Mic, PhoneOff, Volume2 } from "lucide-react";
import { useVoice, type VoiceSource, type VoiceStatus } from "@/components/voice/voice-provider";

// UI del asistente de voz (fase 6). Minimalista por decisión: un indicador de estado
// central (sin subtítulos) y, cuando el modelo cita la biblioteca, tarjetas de
// artículos clicables.

const STATUS_LABEL: Record<Exclude<VoiceStatus, "idle">, string> = {
  connecting: "Conectando…",
  listening: "Te escucho…",
  thinking: "Buscando en la biblioteca…",
  speaking: "Hablando…",
  error: "Hubo un problema",
};

function SourceCard({ source }: { source: VoiceSource }) {
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

function StatusOrb({ status }: { status: VoiceStatus }) {
  const speaking = status === "speaking";
  const listening = status === "listening";
  const busy = status === "connecting" || status === "thinking";

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <span
        className={`absolute inset-0 rounded-full bg-[var(--primary)]/20 ${
          speaking || listening ? "animate-ping" : ""
        }`}
      />
      <span className="absolute inset-2 rounded-full bg-[var(--primary)]/15" />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--background)]">
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : speaking ? (
          <Volume2 className="h-7 w-7" />
        ) : (
          <Mic className="h-7 w-7" />
        )}
      </span>
    </div>
  );
}

export default function VoicePanel({ className = "" }: { className?: string }) {
  const { status, isActive, sources, error, notice, start, stop } = useVoice();

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-4 py-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">Asistente de voz</p>
              <p className="mt-1 max-w-[16rem] text-sm text-[var(--foreground)]/60">
                Conversá en voz alta sobre los temas de la biblioteca. Tocá para empezar.
              </p>
            </div>
            {notice ? <p className="text-sm text-[var(--foreground)]/70">{notice}</p> : null}
            <button
              type="button"
              onClick={() => void start()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--background)] shadow-lg transition hover:bg-[var(--primary-container)]"
              aria-label="Iniciar conversación de voz"
            >
              <Mic className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pt-2">
            <StatusOrb status={status} />
            <p className="text-sm font-medium text-[var(--foreground)]/80">
              {status === "error" ? error ?? STATUS_LABEL.error : STATUS_LABEL[status]}
            </p>
            {status === "error" ? (
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-full border border-[var(--ghost-outline)] px-4 py-1.5 text-sm text-[var(--foreground)]/80 transition hover:border-[var(--primary)]/50 hover:text-[var(--primary)]"
              >
                Reintentar
              </button>
            ) : null}
          </div>
        )}

        {sources.length > 0 ? (
          <div className="w-full">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
              Artículos mencionados
            </p>
            <div className="grid gap-2">
              {sources.map((source) => (
                <SourceCard key={source.postId} source={source} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isActive ? (
        <div className="border-t border-[var(--ghost-outline)] p-3">
          <button
            type="button"
            onClick={stop}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/15 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/25"
          >
            <PhoneOff className="h-4 w-4" />
            Terminar conversación
          </button>
        </div>
      ) : null}
    </div>
  );
}
