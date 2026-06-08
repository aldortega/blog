"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type EmbeddingsStatusSyncProps = {
  postId: string;
  initialStatus: "pending" | "generating" | "ready" | "failed";
};

// Mientras los embeddings se generan (pending/generating), refresca la página al
// llegar a ready/failed. Espeja summary-status-sync.
export default function EmbeddingsStatusSync({ postId, initialStatus }: EmbeddingsStatusSyncProps) {
  const router = useRouter();
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    if (initialStatus !== "pending" && initialStatus !== "generating") {
      return;
    }

    const supabase = createClient();
    let isCancelled = false;

    const pollStatus = async () => {
      const { data } = await supabase
        .from("posts")
        .select("embeddings_status")
        .eq("id", postId)
        .maybeSingle();
      if (isCancelled || !data) {
        return;
      }

      const nextStatus = String((data as { embeddings_status?: string }).embeddings_status ?? "");
      if ((nextStatus === "ready" || nextStatus === "failed") && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true;
        router.refresh();
      }
    };

    void pollStatus();
    const pollInterval = setInterval(() => {
      void pollStatus();
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [postId, initialStatus, router]);

  return null;
}
