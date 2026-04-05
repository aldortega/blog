"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type SummaryStatusSyncProps = {
  postId: string;
  initialStatus: "pending" | "generating" | "ready" | "failed";
};

export default function SummaryStatusSync({ postId, initialStatus }: SummaryStatusSyncProps) {
  const router = useRouter();
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (initialStatus !== "pending" && initialStatus !== "generating") {
      return;
    }

    const supabase = createClient();
    let isCancelled = false;

    const pollSummaryStatus = async () => {
      const { data } = await supabase.from("posts").select("ai_summary_status").eq("id", postId).maybeSingle();
      if (isCancelled || !data) {
        return;
      }

      const nextStatus = String((data as { ai_summary_status?: string }).ai_summary_status ?? "");
      if ((nextStatus === "ready" || nextStatus === "failed") && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true;
        router.refresh();
      }
    };

    void pollSummaryStatus();
    const pollInterval = setInterval(() => {
      void pollSummaryStatus();
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [postId, initialStatus, router]);

  return (
    <div className="mt-3 space-y-2" aria-live="polite" aria-busy="true">
      <span className="sr-only">Generando resumen</span>
      <div className="h-3 w-full max-w-[100%] animate-pulse rounded bg-[#2a3430]" />
      <div className="h-3 w-full max-w-[100%] animate-pulse rounded bg-[#2a3430]" />
      <div className="h-3 w-full max-w-[100%] animate-pulse rounded bg-[#2a3430]" />
      <div className="h-3 w-full max-w-[100%] animate-pulse rounded bg-[#2a3430]" />

    </div>
  );
}
