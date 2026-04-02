import type { Metadata } from "next";
import { Inter, Manrope, Roboto } from "next/font/google";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Artificial Stories",
  description: "Base del blog para analisis de peliculas sobre inteligencia artificial",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email ??
    undefined;

  const userAvatar = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <html
      lang="es"
      className={`${manrope.variable} ${inter.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col text-[var(--foreground)] bg-[var(--background)]">
        <header className="sticky top-0 z-30 border-b border-[var(--ghost-outline)] bg-[rgb(16_20_24_/_0.8)] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <Link href="/" className="brand-glow text-lg font-semibold tracking-tight">
                Artificial Stories
              </Link>
            </div>
            <AuthButton isAuthenticated={Boolean(user)} userName={userName} userAvatar={userAvatar} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
