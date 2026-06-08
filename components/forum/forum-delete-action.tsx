"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import SubmitButton from "@/components/submit-button";

type ForumDeleteActionProps = {
  action: (formData: FormData) => Promise<void>;
  /** name + value de un campo oculto opcional (p. ej. el id de la respuesta). */
  hiddenName?: string;
  hiddenValue?: string;
  title: string;
  description: string;
  triggerLabel: string;
  /** Si es true, muestra solo el ícono (para respuestas); si no, ícono + texto. */
  iconOnly?: boolean;
  className?: string;
};

export default function ForumDeleteAction({
  action,
  hiddenName,
  hiddenValue,
  title,
  description,
  triggerLabel,
  iconOnly = false,
  className,
}: ForumDeleteActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsSubmitting(false);
          setIsOpen(true);
        }}
        className={
          className ??
          "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-300/80 transition-colors hover:text-rose-300"
        }
        aria-label={triggerLabel}
        title={triggerLabel}
        disabled={isSubmitting}
      >
        <Trash2 size={iconOnly ? 14 : 13} />
        {iconOnly ? null : triggerLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090d]/80 px-4"
          onClick={() => {
            if (!isSubmitting) {
              setIsOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#3c4b3a]/40 bg-[#101418] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.6)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-xl font-bold text-white">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#bacbb6]">{description}</p>

            <form
              action={action}
              onSubmit={() => setIsSubmitting(true)}
              className="mt-6 flex justify-end gap-3"
            >
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-[#3c4b3a]/40 px-4 py-2 text-sm font-semibold text-[#bacbb6] transition hover:border-[#3c4b3a]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              {hiddenName ? <input type="hidden" name={hiddenName} value={hiddenValue ?? ""} /> : null}
              <SubmitButton
                idleLabel="Eliminar"
                pendingLabel="Eliminando..."
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
