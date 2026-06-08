import type { Metadata } from "next";
import { Inter, Manrope, Roboto } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileAutoHideHeader, type HeaderCategory } from "@/components/mobile-auto-hide-header";
import { publicServerClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import { ChatProvider } from "@/components/chat/chat-provider";
import ChatWidget from "@/components/chat/chat-widget";
import { VoiceProvider } from "@/components/voice/voice-provider";
import VoiceWidget from "@/components/voice/voice-widget";
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
  description: "Biblioteca de articulos sobre inteligencia artificial y sistemas inteligentes",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: categories } = await publicServerClient
    .from("categories")
    .select("name, slug")
    .order("name");

  // El chatbot requiere login: montamos el provider y el widget solo si hay sesión
  // (gating server-side, coherente con el redirect de /chat). Leer la sesión vuelve
  // el layout dinámico por request.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch AI settings and user role in parallel
  const [profileRes, settingRes] = await Promise.all([
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    publicServerClient
      .from("site_settings")
      .select("value")
      .eq("key", "disable_ai")
      .maybeSingle(),
  ]);

  const isAdmin = profileRes.data?.role === "admin";
  const isAiDisabled = settingRes.data?.value === true;

  return (
    <html
      lang="es"
      className={`${manrope.variable} ${inter.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col text-[var(--foreground)] bg-[var(--background)]">
        <MobileAutoHideHeader
          categories={(categories ?? []) as HeaderCategory[]}
          isAiDisabled={isAiDisabled}
          isAdmin={isAdmin}
        />
        {user ? (
          <ChatProvider>
            <VoiceProvider>
              <main className="flex-1">{children}</main>
              {!isAiDisabled && <ChatWidget />}
              {!isAiDisabled && <VoiceWidget />}
            </VoiceProvider>
          </ChatProvider>
        ) : (
          <main className="flex-1">{children}</main>
        )}
        <SpeedInsights />
      </body>
    </html>
  );
}
