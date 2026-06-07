import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildLiveConfig, getLiveClient, getVoiceModel, getVoiceName } from "@/lib/ai/voice";

// Token efímero para el asistente de voz (fase 6). El navegador NO recibe la API key:
// abre el WebSocket directo a la Gemini Live API con este token de corta vida, que
// solo emitimos si hay sesión Supabase. El system prompt y las tools quedan fijados
// (lockeados) en el token vía liveConnectConstraints, así un cliente manipulado no
// puede cambiar el comportamiento ni el grounding.

export const dynamic = "force-dynamic";

// El token sirve para ABRIR una sesión dentro de esta ventana (newSessionExpireTime).
const NEW_SESSION_WINDOW_MS = 2 * 60_000; // 2 min para iniciar la llamada.
// Tras este tiempo, la Live API rechaza mensajes (algo por encima del tope duro de
// ~5 min del cliente, para que el corte lo maneje la UI con aviso, no la API).
const SESSION_HARD_LIMIT_MS = 6 * 60_000;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const model = getVoiceModel();
  const voice = getVoiceName();

  try {
    const ai = getLiveClient();
    const now = Date.now();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
        expireTime: new Date(now + SESSION_HARD_LIMIT_MS).toISOString(),
        // Al fijar la config acá, queda lockeada en el token: el cliente abre la
        // sesión sin reenviar system prompt ni tools, así que no puede alterarlos.
        liveConnectConstraints: {
          model,
          config: buildLiveConfig(voice),
        },
      },
    });

    if (!token.name) {
      throw new Error("authTokens.create devolvió un token sin name");
    }

    return NextResponse.json({ token: token.name, model });
  } catch (error) {
    console.error("Error minting Live ephemeral token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo iniciar el asistente de voz." }, { status: 502 });
  }
}
