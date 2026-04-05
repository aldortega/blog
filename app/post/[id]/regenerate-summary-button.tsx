"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";

type RegenerateSummaryButtonProps = {
  className?: string;
};

export default function RegenerateSummaryButton({ className = "" }: RegenerateSummaryButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label="Regenerar resumen"
      title={pending ? "Regenerando resumen" : "Regenerar resumen"}
      className={className}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`.trim()} />
    </button>
  );
}
