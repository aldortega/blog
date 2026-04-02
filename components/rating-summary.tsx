import { Star } from "lucide-react";

type RatingSummaryProps = {
  average: number | null;
  count?: number;
  className?: string;
  textClassName?: string;
  countClassName?: string;
  starSize?: number;
};

export default function RatingSummary({
  average,
  count,
  className,
  textClassName,
  countClassName,
  starSize = 20,
}: RatingSummaryProps) {
  const hasAverage = typeof average === "number" && Number.isFinite(average);
  const averageText = hasAverage ? `${average.toFixed(1)}` : "--";
  const rootClassName = className ?? "flex items-center gap-2";
  const labelClassName = textClassName ?? "text-sm text-[#bacbb6]";
  const votesClassName = countClassName ?? "text-xs text-[#bacbb6]/80";
  const votesText = `${count ?? 0} ${(count ?? 0) === 1 ? "voto" : "votos"}`;

  return (
    <div className={rootClassName}>
      <span className="relative inline-block" style={{ width: `${starSize}px`, height: `${starSize}px` }}>
        <Star className="absolute inset-0 h-full w-full text-[#3c4b3a]" fill="none" strokeWidth={1.8} />
        <Star className="absolute inset-0 h-full w-full text-[#40fe6d]" fill="currentColor" stroke="none" />
      </span>
      <span className={labelClassName}>{averageText}</span>
      <span className={votesClassName}>({votesText})</span>
    </div>
  );
}
