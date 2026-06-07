"use client";

import { Mic, X } from "lucide-react";
import { useState } from "react";
import VoicePanel from "@/components/voice/voice-panel";
import { useVoice } from "@/components/voice/voice-provider";

// Segundo widget flotante (fase 6): el asistente de voz. FAB propio (micrófono) a la
// izquierda del asistente de texto. Se monta solo para usuarios logueados (lo decide
// el layout). Cerrar el panel termina la sesión Live.
export default function VoiceWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { isActive, stop } = useVoice();

  const close = () => {
    setIsOpen(false);
    stop();
  };

  return (
    <>
      {isOpen ? (
        <div className="fixed bottom-24 right-20 z-50 flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border border-[var(--ghost-outline)] bg-[var(--background)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--ghost-outline)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">Asistente de voz</span>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar asistente de voz"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--foreground)]/70 transition hover:bg-[var(--surface-high)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <VoicePanel className="min-h-0 flex-1" />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-label={isOpen ? "Cerrar asistente de voz" : "Abrir asistente de voz"}
        className={`fixed bottom-4 right-20 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--ghost-outline)] bg-[var(--surface-high)] text-[var(--foreground)] shadow-lg transition hover:text-[var(--primary)] ${
          isActive ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--background)]" : ""
        }`}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </button>
    </>
  );
}
