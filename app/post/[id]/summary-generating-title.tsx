"use client";

import { useEffect, useState } from "react";

export default function SummaryGeneratingTitle() {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDotCount((current) => (current + 1) % 4);
    }, 350);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return <span>Generando resumen{".".repeat(dotCount)}</span>;
}
