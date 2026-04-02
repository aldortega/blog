"use client";

import type { MouseEvent } from "react";
import { useRef, useState } from "react";
import { Star, StarHalf } from "lucide-react";
type PostRatingControlProps = {
  isAuthenticated: boolean;
  initialRating: number | null;
  onRate: (formData: FormData) => Promise<void>;
};

function starState(star: number, activeRating: number | null) {
  if (!activeRating) {
    return "empty" as const;
  }

  if (activeRating >= star) {
    return "full" as const;
  }

  if (activeRating === star - 0.5) {
    return "half" as const;
  }

  return "empty" as const;
}

export default function PostRatingControl({
  isAuthenticated,
  initialRating,
  onRate,
}: PostRatingControlProps) {
  const [draftRating, setDraftRating] = useState<number | null>(initialRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeRating = hoverRating ?? draftRating;

  function submitScore(score: number) {
    if (!inputRef.current || !formRef.current) {
      return;
    }

    inputRef.current.value = score.toFixed(1);
    setDraftRating(score);
    window.dispatchEvent(
      new CustomEvent("post-rating:optimistic", {
        detail: { score },
      }),
    );
    formRef.current.requestSubmit();
  }

  function selectStar(event: MouseEvent<HTMLButtonElement>, star: number) {
    if (!isAuthenticated) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickedLeftHalf = event.clientX - rect.left < rect.width / 2;
    const score = clickedLeftHalf ? star - 0.5 : star;
    submitScore(score);
  }

  function previewStar(event: MouseEvent<HTMLButtonElement>, star: number) {
    if (!isAuthenticated) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const hoveringLeftHalf = event.clientX - rect.left < rect.width / 2;
    setHoverRating(hoveringLeftHalf ? star - 0.5 : star);
  }

  return (
    <section className="rounded-2xl border border-[#3c4b3a]/35 bg-[#0b0f12] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#bacbb6]">Puntuar post</p>

      <div className="mt-3">
        <form ref={formRef} action={onRate}>
          <input ref={inputRef} type="hidden" name="score" defaultValue={initialRating?.toFixed(1) ?? "0.5"} />
          <div
            className={`flex items-center gap-1 ${isAuthenticated ? "" : "opacity-60"}`}
            onMouseLeave={() => setHoverRating(null)}
          >
            {Array.from({ length: 5 }, (_, index) => {
              const star = index + 1;
              const state = starState(star, activeRating);
              return (
                <button
                  key={star}
                  type="button"
                  onMouseMove={(event) => previewStar(event, star)}
                  onClick={(event) => selectStar(event, star)}
                  disabled={!isAuthenticated}
                  className="relative inline-flex h-8 w-8 items-center justify-center disabled:cursor-not-allowed"
                  aria-label={`Puntuar ${star} estrellas`}
                >
                  <Star className="absolute inset-0 h-full w-full text-[#3c4b3a]" fill="none" strokeWidth={1.8} />
                  {state === "full" ? (
                    <Star
                      className="absolute inset-0 h-full w-full text-[#40fe6d]"
                      fill="currentColor"
                      stroke="none"
                    />
                  ) : null}
                  {state === "half" ? (
                    <StarHalf
                      className="absolute inset-0 h-full w-full text-[#40fe6d]"
                      fill="currentColor"
                      stroke="none"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </form>
      </div>
    </section>
  );
}
