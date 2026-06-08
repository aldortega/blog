"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";

type RegenerateEmbeddingsButtonProps = {
  className?: string;
  label?: string;
};

export default function RegenerateEmbeddingsButton({
  className = "",
  label = "Regenerar embeddings",
}: RegenerateEmbeddingsButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
      title={pending ? "Regenerando embeddings" : label}
      className={className}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`.trim()} />
    </button>
  );
}
