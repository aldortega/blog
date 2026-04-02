import type { Metadata } from "next";
import { Inter, Manrope, Roboto } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileAutoHideHeader } from "@/components/mobile-auto-hide-header";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${inter.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col text-[var(--foreground)] bg-[var(--background)]">
        <MobileAutoHideHeader />
        <main className="flex-1">{children}</main>
        <SpeedInsights />
      </body>
    </html>
  );
}
