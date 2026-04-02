"use client";

import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CreatePostCtaProps = {
  label?: string;
  className?: string;
};

export function CreatePostCta({ label = "Crear post", className = "" }: CreatePostCtaProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function loadInitialUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
        setIsBootstrapping(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(Boolean(user));
      setIsBootstrapping(false);
    }

    void loadInitialUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setIsLoggedIn(Boolean(session?.user));
      setIsBootstrapping(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (isBootstrapping || !isLoggedIn) {
    return null;
  }

  return (
    <Link
      href="/nuevo-post"
      className={`cta-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition hover:brightness-105 sm:w-auto ${className}`}
    >
      <Plus size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}
