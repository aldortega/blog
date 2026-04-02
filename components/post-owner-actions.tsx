"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import SubmitButton from "@/components/submit-button";

type PostOwnerActionsProps = {
  postId: string;
  onDelete: () => Promise<void>;
};

export default function PostOwnerActions({ postId, onDelete }: PostOwnerActionsProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={`/post/${postId}/editar`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#3c4b3a]/50 bg-[#181c20]/80 text-[#bacbb6] transition hover:border-[#40fe6d]/50 hover:text-[#40fe6d]"
          aria-label="Editar post"
          title="Editar post"
        >
          <Pencil className="h-[18px] w-[18px]" />
        </Link>

        <button
          type="button"
          onClick={() => {
            setIsSubmitting(false);
            setIsDeleteOpen(true);
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-900/50 bg-rose-950/30 text-rose-300 transition hover:border-rose-500/70 hover:text-rose-200"
          aria-label="Borrar post"
          title="Borrar post"
          disabled={isSubmitting}
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      {isDeleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090d]/80 px-4"
          onClick={() => {
            if (!isSubmitting) {
              setIsDeleteOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#3c4b3a]/40 bg-[#101418] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.6)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-post-title" className="text-xl font-bold text-white">
              Borrar post
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#bacbb6]">
              Esta accion no se puede deshacer. Se eliminara el post de forma permanente.
            </p>

            <form
              action={onDelete}
              onSubmit={() => setIsSubmitting(true)}
              className="mt-6 flex justify-end gap-3"
            >
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-[#3c4b3a]/40 px-4 py-2 text-sm font-semibold text-[#bacbb6] transition hover:border-[#3c4b3a]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <SubmitButton
                idleLabel="Borrar"
                pendingLabel="Borrando..."
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
