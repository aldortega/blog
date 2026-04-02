"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";
import LoadingSpinner from "@/components/loading-spinner";

type SubmitButtonProps = Omit<ComponentPropsWithoutRef<"button">, "children" | "type"> & {
  idleLabel: string;
  pendingLabel: string;
};

export default function SubmitButton({
  idleLabel,
  pendingLabel,
  className = "",
  disabled = false,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`inline-flex items-center justify-center ${className}`.trim()}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2 text-center leading-none">
        {pending ? <LoadingSpinner /> : null}
        <span>{pending ? pendingLabel : idleLabel}</span>
      </span>
    </button>
  );
}
