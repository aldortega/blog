import { LoaderCircle } from "lucide-react";

type LoadingSpinnerProps = {
  className?: string;
};

export default function LoadingSpinner({ className = "" }: LoadingSpinnerProps) {
  return <LoaderCircle className={`h-4 w-4 shrink-0 animate-spin ${className}`.trim()} aria-hidden="true" />;
}
