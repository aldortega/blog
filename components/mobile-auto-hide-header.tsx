"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AuthButton } from "@/components/auth-button";

export type HeaderCategory = {
  name: string;
  slug: string;
};

function CategoriesMenu({ categories }: { categories: HeaderCategory[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cierra al clickear fuera o con Escape (importante para el modo click/tap).
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Hover (desktop): abre al entrar, cierra con un pequeño delay al salir para que
  // se pueda mover el mouse del disparador al panel sin que se cierre.
  const openOnHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeOnHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openOnHover}
      onMouseLeave={closeOnHover}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
      >
        Categorías
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-[var(--ghost-outline)] bg-[rgb(16_20_24_/_0.97)] p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/seccion/${category.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block truncate rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-low)] hover:text-[var(--primary)]"
            >
              {category.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
          {categories.length > 0 ? <CategoriesMenu categories={categories} /> : null}
        </div>
        <AuthButton />
      </div>
    </header>
  );
}
