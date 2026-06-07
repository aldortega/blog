"use client";

import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import ChatPanel from "@/components/chat/chat-panel";

// Widget flotante global (fase 5). Se monta solo para usuarios logueados (lo decide
// el layout server-side). Es la única superficie del asistente.
export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen ? (
        <div className="fixed bottom-24 right-4 z-50 flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border border-[var(--ghost-outline)] bg-[var(--background)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--ghost-outline)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">Asistente</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar asistente"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--foreground)]/70 transition hover:bg-[var(--surface-high)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatPanel className="min-h-0 flex-1" />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente"}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--background)] shadow-lg transition hover:bg-[var(--primary-container)]"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
