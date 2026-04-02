"use client";

import Link from "next/link";
import { useEffect } from "react";

type PostErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PostError({ error, reset }: PostErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#101418] px-6 py-14 text-[#e0e3e8] lg:px-20">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-[#3c4b3a]/40 bg-[#141b20] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#40fe6d]">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">No se pudo cargar el post</h1>
        <p className="font-body text-sm text-[#bacbb6]">
          Ocurrio un problema inesperado. Puedes intentarlo nuevamente o volver al inicio.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-[#40fe6d] px-4 py-2 text-sm font-semibold text-[#0f1518] transition hover:brightness-105"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-xl border border-[#3c4b3a]/50 px-4 py-2 text-sm font-medium text-[#e0e3e8] transition hover:bg-[#1b2328]"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
