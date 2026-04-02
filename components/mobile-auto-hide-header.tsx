"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";

export function MobileAutoHideHeader() {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const SCROLL_DELTA = 6;

    const onScroll = () => {
      if (window.innerWidth >= 768) {
        setIsHidden(false);
        lastScrollY.current = window.scrollY;
        return;
      }

      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current + SCROLL_DELTA;
      const scrollingUp = currentScrollY < lastScrollY.current - SCROLL_DELTA;

      if (currentScrollY <= 8 || scrollingUp) {
        setIsHidden(false);
      } else if (scrollingDown) {
        setIsHidden(true);
      }

      lastScrollY.current = currentScrollY;
    };

    lastScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 border-b border-[var(--ghost-outline)] bg-[rgb(16_20_24_/_0.8)] backdrop-blur-xl transition-transform duration-300 ${
        isHidden ? "-translate-y-full" : "translate-y-0"
      } md:translate-y-0`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <Link href="/" className="brand-glow text-lg font-semibold tracking-tight">
            Artificial Stories
          </Link>
        </div>
        <AuthButton />
      </div>
    </header>
  );
}
