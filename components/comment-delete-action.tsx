"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import SubmitButton from "@/components/submit-button";

type CommentDeleteActionProps = {
  commentId: string;
  onDelete: (formData: FormData) => Promise<void>;
  className?: string;
};

export default function CommentDeleteAction({ commentId, onDelete, className }: CommentDeleteActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = `delete-comment-title-${commentId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsSubmitting(false);
          setIsOpen(true);
        }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-950/20 text-rose-300 transition hover:bg-rose-900/40 hover:text-rose-200 ${className ?? ""}`}
        aria-label="Eliminar comentario"
        title="Eliminar comentario"
        disabled={isSubmitting}
      >
        <Trash2 size={14} />
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
              Eliminar comentario
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#bacbb6]">
              Esta accion no se puede deshacer. El comentario se eliminara de forma permanente.
            </p>

            <form
              action={onDelete}
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
                <input type="hidden" name="comment_id" value={commentId} />
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
