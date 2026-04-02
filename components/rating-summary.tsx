import { Star } from "lucide-react";

type RatingSummaryProps = {
  average: number | null;
  className?: string;
  textClassName?: string;
  starSize?: number;
};

export default function RatingSummary({
  average,
  className,
  textClassName,
  starSize = 20,
}: RatingSummaryProps) {
  const averageText = average ? `${average.toFixed(1)}` : "--";
  const rootClassName = className ?? "flex items-center gap-2";
  const labelClassName = textClassName ?? "text-sm text-[#bacbb6]";

  return (
    <div className={rootClassName}>
      <span className="relative inline-block" style={{ width: `${starSize}px`, height: `${starSize}px` }}>
        <Star className="absolute inset-0 h-full w-full text-[#3c4b3a]" fill="none" strokeWidth={1.8} />
        <Star className="absolute inset-0 h-full w-full text-[#40fe6d]" fill="currentColor" stroke="none" />
      </span>
      <span className={labelClassName}>{averageText}</span>
    </div>
  );
}
