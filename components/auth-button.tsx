"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";

type AuthButtonProps = {
  isAuthenticated: boolean;
  userName?: string;
  userAvatar?: string;
};

export function AuthButton({ isAuthenticated, userName, userAvatar }: AuthButtonProps) {
  const supabase = createClient();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    router.refresh();
    setIsLoading(false);
  };

  if (isAuthenticated) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 rounded-full p-1 transition hover:opacity-80"
        >
          <Image
            src={userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || "U")}&background=random`}
            alt={userName || "Usuario"}
            className="rounded-full object-cover"
            width={36}
            height={36}
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
      className="font-body rounded-xl bg-[var(--surface-highest)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-high)] disabled:cursor-not-allowed disabled:opacity-60"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
    >
      {isLoading ? "Conectando..." : "Iniciar con Google"}
    </button>
  );
}
