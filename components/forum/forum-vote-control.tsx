"use client";

import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { castVote, type VoteTargetType, type VoteValue } from "@/app/foro/actions";

type ForumVoteControlProps = {
  targetType: VoteTargetType;
  targetId: string;
  initialScore: number;
  /** Voto actual del usuario: 1, -1 o 0 (sin voto). */
  initialUserValue: number;
  isAuthenticated: boolean;
  /** "vertical" para tarjetas/respuestas; "horizontal" para barras compactas. */
  orientation?: "vertical" | "horizontal";
};

const numberFormatter = new Intl.NumberFormat("es-AR");

export default function ForumVoteControl({
  targetType,
  targetId,
  initialScore,
  initialUserValue,
  isAuthenticated,
  orientation = "vertical",
}: ForumVoteControlProps) {
  const [score, setScore] = useState(initialScore);
  const [userValue, setUserValue] = useState(initialUserValue);
  const [isPending, startTransition] = useTransition();

  function vote(direction: VoteValue) {
    if (!isAuthenticated || isPending) {
      return;
    }

    const previousScore = score;
    const previousUserValue = userValue;

    // Optimista: alterna en la misma dirección, cambia en la opuesta.
    const nextUserValue = userValue === direction ? 0 : direction;
    setScore((current) => current + (nextUserValue - userValue));
    setUserValue(nextUserValue);

    startTransition(async () => {
      const result = await castVote(targetType, targetId, direction);
      if (result.ok) {
        setScore(result.score);
        setUserValue(result.userValue);
      } else {
        // Revertir si el servidor rechazó la acción.
        setScore(previousScore);
        setUserValue(previousUserValue);
      }
    });
  }

  const isUp = userValue === 1;
  const isDown = userValue === -1;
  const containerClass =
    orientation === "vertical"
      ? "flex flex-col items-center gap-1"
      : "flex items-center gap-1.5";

  const baseButton =
    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed";
  const upClass = isUp
    ? "bg-[#40fe6d]/15 text-[#40fe6d]"
    : "text-[#bacbb6] hover:bg-[#3c4b3a]/20 hover:text-[#40fe6d]";
  const downClass = isDown
    ? "bg-rose-500/15 text-rose-400"
    : "text-[#bacbb6] hover:bg-[#3c4b3a]/20 hover:text-rose-400";

  const scoreColor = isUp ? "text-[#40fe6d]" : isDown ? "text-rose-400" : "text-[#e0e3e8]";

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={() => vote(1)}
        disabled={!isAuthenticated || isPending}
        aria-pressed={isUp}
        aria-label="Votar positivo"
        title={isAuthenticated ? "Votar positivo" : "Inicia sesión para votar"}
        className={`${baseButton} ${upClass}`}
      >
        <ChevronUp size={18} />
      </button>

      <span className={`min-w-[2ch] text-center text-sm font-bold tabular-nums ${scoreColor}`}>
        {numberFormatter.format(score)}
      </span>

      <button
        type="button"
        onClick={() => vote(-1)}
        disabled={!isAuthenticated || isPending}
        aria-pressed={isDown}
        aria-label="Votar negativo"
        title={isAuthenticated ? "Votar negativo" : "Inicia sesión para votar"}
        className={`${baseButton} ${downClass}`}
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
}
