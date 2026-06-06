import type { Metadata } from "next";
import { Inter, Manrope, Roboto } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileAutoHideHeader, type HeaderCategory } from "@/components/mobile-auto-hide-header";
import { publicServerClient } from "@/lib/supabase/public-server";
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
  title: "Repositorio de Sistemas Inteligentes",
  description: "Biblioteca curada de articulos sobre inteligencia artificial y sistemas inteligentes",
};

export const revalidate = 300;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: categories } = await publicServerClient
    .from("categories")
    .select("name, slug")
    .order("name");

  return (
    <html
      lang="es"
      className={`${manrope.variable} ${inter.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col text-[var(--foreground)] bg-[var(--background)]">
        <MobileAutoHideHeader categories={(categories ?? []) as HeaderCategory[]} />
        <main className="flex-1">{children}</main>
        <SpeedInsights />
      </body>
    </html>
  );
}
