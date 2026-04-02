"use client";

import { useEffect, useState } from "react";
import RatingSummary from "@/components/rating-summary";

type PostAverageRatingProps = {
  initialAverage: number | null;
  initialCount: number;
  initialViewerRating: number | null;
  textClassName?: string;
};

type RatingOptimisticEventDetail = {
  score: number;
};

function nextAverage(params: {
  average: number | null;
  count: number;
  previousViewerRating: number | null;
  nextViewerRating: number;
}) {
  const { average, count, previousViewerRating, nextViewerRating } = params;
  const currentSum = (average ?? 0) * count;

  if (count === 0 || previousViewerRating === null) {
    const newCount = count + 1;
    return (currentSum + nextViewerRating) / newCount;
  }

  return (currentSum - previousViewerRating + nextViewerRating) / count;
}

export default function PostAverageRating({
  initialAverage,
  initialCount,
  initialViewerRating,
  textClassName,
}: PostAverageRatingProps) {
  const [average, setAverage] = useState<number | null>(initialAverage);
  const [count, setCount] = useState<number>(initialCount);
  const [viewerRating, setViewerRating] = useState<number | null>(initialViewerRating);

  useEffect(() => {
    function onOptimisticVote(event: Event) {
      const customEvent = event as CustomEvent<RatingOptimisticEventDetail>;
      const score = customEvent.detail?.score;
      if (typeof score !== "number" || Number.isNaN(score)) {
        return;
      }

      setAverage((currentAverage) =>
        nextAverage({
          average: currentAverage,
          count,
          previousViewerRating: viewerRating,
          nextViewerRating: score,
        }),
      );
      if (viewerRating === null) {
        setCount((currentCount) => currentCount + 1);
      }
      setViewerRating(score);
    }

    window.addEventListener("post-rating:optimistic", onOptimisticVote as EventListener);
    return () => {
      window.removeEventListener("post-rating:optimistic", onOptimisticVote as EventListener);
    };
  }, [count, viewerRating]);

  return <RatingSummary average={average} textClassName={textClassName} />;
}
