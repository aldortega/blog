"use client";

import { useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import SubmitButton from "@/components/submit-button";

const MAX_REPLY_LENGTH = 2000;

type ForumReplyFormProps = {
  action: (formData: FormData) => Promise<void>;
  /** parent_id de la respuesta; null para responder al hilo. */
  parentId?: string | null;
  /** Si se pasa, el form arranca colapsado tras un botón con esta etiqueta. */
  triggerLabel?: string;
  placeholder?: string;
};

export default function ForumReplyForm({
  action,
  parentId = null,
  triggerLabel,
  placeholder = "Escribe tu respuesta...",
}: ForumReplyFormProps) {
  const [open, setOpen] = useState(!triggerLabel);
  const formRef = useRef<HTMLFormElement>(null);

  if (triggerLabel && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#bacbb6] transition-colors hover:text-[#40fe6d]"
      >
        <MessageSquare size={13} />
        {triggerLabel}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
        if (triggerLabel) {
          setOpen(false);
        }
      }}
      className="rounded-xl border border-[#3c4b3a]/30 bg-[#0b0f12] p-3 transition-colors focus-within:border-[#40fe6d]"
    >
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <textarea
        name="body"
        required
        maxLength={MAX_REPLY_LENGTH}
        placeholder={placeholder}
        autoFocus={Boolean(triggerLabel)}
        className="w-full resize-none bg-transparent text-sm text-[#e0e3e8] outline-none placeholder:text-[#bacbb6]/50 font-body min-h-[72px]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {triggerLabel ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#bacbb6] transition hover:text-white"
          >
            Cancelar
          </button>
        ) : null}
        <SubmitButton
          idleLabel="Responder"
          pendingLabel="Enviando..."
          className="rounded-lg bg-[#40fe6d] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#00390f] transition-colors hover:bg-[#00e054] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </form>
  );
}
