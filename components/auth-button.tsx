"use client";

import { createClient } from "@/lib/supabase/client";
import { resolveAvatarSrc } from "@/lib/avatar";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type AuthUser = {
  name?: string;
  avatar?: string;
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.88c2.26-2.08 3.54-5.16 3.54-8.67Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3a7.2 7.2 0 0 1-10.73-3.78h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.32 14.32A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.39-2.32v-3.1h-4A12 12 0 0 0 0 12c0 1.94.46 3.78 1.32 5.42l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.24 15.23 0 12 0A12 12 0 0 0 1.32 6.58l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

function mapUser(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): AuthUser | null {
  if (!user) {
    return null;
  }

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user.email ?? undefined;
  const avatar =
    typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined;

  return {
    name: fullName,
    avatar,
  };
}

export function AuthButton() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(mapUser(session.user));
        setIsBootstrapping(false);
        return;
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(mapUser(currentUser));
      setIsBootstrapping(false);
    }

    void loadInitialUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(mapUser(session?.user ?? null));
      setIsBootstrapping(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setIsLoading(false);
      router.push("/auth/error");
      return;
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setShowMenu(false);
    router.refresh();
    setIsLoading(false);
  };

  if (isBootstrapping) {
    return (
      <div className="h-9 w-9 rounded-full bg-[var(--surface-highest)]" aria-hidden="true" />
    );
  }

  if (user) {
    const avatarSrc = resolveAvatarSrc(user.avatar, user.name || "U");

    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 rounded-full p-1 transition hover:opacity-80"
        >
          <Image
            src={avatarSrc}
            alt={user.name || "Usuario"}
            className="rounded-full object-cover"
            width={36}
            height={36}
            quality={100}
          />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[var(--ghost-outline)] bg-[var(--surface-highest)] py-1 shadow-lg">
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-sm font-body text-[var(--foreground)] hover:bg-[var(--surface-high)]"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              {isLoading ? "Cerrando..." : "Cerrar sesion"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="font-body inline-flex items-center gap-2 rounded-xl bg-[var(--surface-highest)] px-4 py-2 text-sm font-normal text-[var(--foreground)] transition hover:bg-[var(--surface-high)] disabled:cursor-not-allowed disabled:opacity-60"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
    >
      <GoogleIcon />
      <span>
        {isLoading ? "Ingresando..." : "Ingresar"}
      </span>
    </button>
  );
}
