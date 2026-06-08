import { createClient } from "@/lib/supabase/server";
import { isSupportedAudioType, transcribeAudio } from "@/lib/ai/transcribe";
import { NextResponse } from "next/server";

// Transcripción de voz del chatbot (fase 5). Gateado a login (el chatbot requiere
// sesión). Recibe el audio grabado por MediaRecorder vía FormData y devuelve el
// texto, que el cliente coloca en el input para que el usuario lo revise y envíe.

const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido. Se espera FormData con audio." }, { status: 400 });
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File) || audioFile.size === 0) {
    return NextResponse.json({ error: "Debes enviar un audio válido." }, { status: 400 });
  }

  if (audioFile.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json({ error: "El audio supera el máximo de 10MB." }, { status: 400 });
  }

  if (!isSupportedAudioType(audioFile.type)) {
    return NextResponse.json({ error: "Formato de audio no soportado." }, { status: 400 });
  }

  try {
    const buffer = await audioFile.arrayBuffer();
    const text = await transcribeAudio(buffer, audioFile.type);
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error transcribing audio", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo transcribir el audio." }, { status: 502 });
  }
}
