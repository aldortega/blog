"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";

export type HeaderCategory = {
  name: string;
  slug: string;
};

export function MobileAutoHideHeader({
  categories = [],
}: {
  categories?: HeaderCategory[];
}) {
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
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="brand-glow shrink-0 text-lg font-semibold tracking-tight">
            Sistemas Inteligentes
          </Link>
          {categories.length > 0 ? (
            <nav className="hidden min-w-0 items-center gap-4 overflow-x-auto md:flex">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/seccion/${category.slug}`}
                  className="whitespace-nowrap text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        <AuthButton />
      </div>
      {categories.length > 0 ? (
        <nav className="flex items-center gap-4 overflow-x-auto border-t border-[var(--ghost-outline)] px-6 py-2.5 md:hidden">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/seccion/${category.slug}`}
              className="whitespace-nowrap text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
            >
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
