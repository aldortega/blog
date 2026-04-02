"use client";

import type { MouseEvent, PointerEvent, RefObject } from "react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Star, StarHalf } from "lucide-react";
import LoadingSpinner from "@/components/loading-spinner";

type PostRatingControlProps = {
  isAuthenticated: boolean;
  initialRating: number | null;
  onRate: (formData: FormData) => Promise<void>;
};

type RatingStarsProps = {
  activeRating: number | null;
  isAuthenticated: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  setDraftRating: (rating: number) => void;
  setHoverRating: (rating: number | null) => void;
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

function scoreFromPointer(event: MouseEvent<HTMLButtonElement>, star: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  const clickedLeftHalf = event.clientX - rect.left < rect.width / 2;
  return clickedLeftHalf ? star - 0.5 : star;
}

function scoreFromPosition(clientX: number, rect: DOMRect) {
  const relative = (clientX - rect.left) / rect.width;
  const clamped = Math.min(1, Math.max(0, relative));
  const halfSteps = Math.max(1, Math.min(10, Math.round(clamped * 10)));
  return halfSteps / 2;
}

function RatingStars({
  activeRating,
  isAuthenticated,
  formRef,
  inputRef,
  setDraftRating,
  setHoverRating,
}: RatingStarsProps) {
  const { pending } = useFormStatus();
  const isDisabled = !isAuthenticated || pending;
  const starsRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  function updateScore(score: number) {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.value = score.toFixed(1);
    setDraftRating(score);
    window.dispatchEvent(
      new CustomEvent("post-rating:optimistic", {
        detail: { score },
      }),
    );
  }

  function scoreFromDrag(event: PointerEvent<HTMLDivElement>) {
    const rect = starsRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    return scoreFromPosition(event.clientX, rect);
  }

  function handlePreview(event: MouseEvent<HTMLButtonElement>, star: number) {
    if (isDisabled) {
      return;
    }

    setHoverRating(scoreFromPointer(event, star));
  }

  function handleSelect(event: MouseEvent<HTMLButtonElement>, star: number) {
    if (isDisabled || !inputRef.current) {
      event.preventDefault();
      return;
    }

    updateScore(scoreFromPointer(event, star));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isDisabled || event.pointerType === "mouse") {
      return;
    }

    const score = scoreFromDrag(event);
    if (!score) {
      return;
    }

    event.preventDefault();
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHoverRating(score);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isDisabled || !isDraggingRef.current) {
      return;
    }

    const score = scoreFromDrag(event);
    if (score) {
      setHoverRating(score);
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (isDisabled || !isDraggingRef.current) {
      return;
    }

    const score = scoreFromDrag(event);
    if (!score) {
      return;
    }

    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setHoverRating(null);
    updateScore(score);
    formRef.current?.requestSubmit();
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    setHoverRating(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <div
        ref={starsRef}
        className={`flex items-center gap-1 touch-none ${isAuthenticated ? "" : "opacity-60"} ${pending ? "opacity-70" : ""}`}
        onMouseLeave={() => setHoverRating(null)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const star = index + 1;
          const state = starState(star, activeRating);
          return (
            <button
              key={star}
              type="submit"
              onMouseMove={(event) => handlePreview(event, star)}
              onClick={(event) => handleSelect(event, star)}
              disabled={isDisabled}
              className="relative inline-flex h-10 w-10 items-center justify-center disabled:cursor-not-allowed sm:h-8 sm:w-8"
              aria-label={`Puntuar ${star} estrellas`}
              aria-busy={pending}
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

      {pending ? (
        <p className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#bacbb6]">
          <LoadingSpinner className="h-3.5 w-3.5" />
          Guardando puntuacion...
        </p>
      ) : null}
    </>
  );
}

export default function PostRatingControl({
  isAuthenticated,
  initialRating,
  onRate,
}: PostRatingControlProps) {
  const [draftRating, setDraftRating] = useState<number | null>(initialRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRating = hoverRating ?? draftRating;

  return (
    <section className="rounded-2xl border border-[#3c4b3a]/35 bg-[#0b0f12] p-5">
      <p className="text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#bacbb6]">Puntuar post</p>

      <div className="mt-3">
        <form ref={formRef} action={onRate} className="flex flex-col items-center">
          <input ref={inputRef} type="hidden" name="score" defaultValue={initialRating?.toFixed(1) ?? "0.5"} />
          <RatingStars
            activeRating={activeRating}
            isAuthenticated={isAuthenticated}
            formRef={formRef}
            inputRef={inputRef}
            setDraftRating={setDraftRating}
            setHoverRating={setHoverRating}
          />
        </form>
      </div>
    </section>
  );
}
