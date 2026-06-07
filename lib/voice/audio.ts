// Utilidades de audio del navegador para el asistente de voz (fase 6).
//
// Captura: micrófono → AudioWorklet a 16 kHz → chunks PCM16 (lo que pide la Live
// API en sendRealtimeInput, mimeType audio/pcm;rate=16000). El worklet además mide
// la energía (RMS) de cada bloque para que el provider detecte silencio prolongado
// y corte la sesión (guardrail de costo).
//
// Reproducción: la Live API devuelve PCM16 a 24 kHz en base64; se agenda en una
// AudioContext de salida. clear() vacía la cola para el barge-in (cuando el usuario
// interrumpe al modelo).

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

// Encima de este RMS consideramos que hay voz (para el corte por inactividad).
const VOICE_RMS_THRESHOLD = 0.012;

// Worklet inline: convierte Float32 [-1,1] a Int16 y emite cada ~2048 muestras.
const RECORDER_WORKLET = `
class RecorderWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(2048);
    this.index = 0;
  }
  flush() {
    if (this.index === 0) return;
    const slice = this.buffer.slice(0, this.index);
    let sumSq = 0;
    for (let i = 0; i < slice.length; i++) {
      const v = slice[i] / 32768;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / slice.length);
    this.port.postMessage({ pcm: slice.buffer, rms }, [slice.buffer]);
    this.index = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        let s = channel[i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        this.buffer[this.index++] = s < 0 ? s * 32768 : s * 32767;
        if (this.index >= this.buffer.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor("recorder-worklet", RecorderWorklet);
`;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Copiamos a un buffer propio para garantizar alineación de 2 bytes.
  return new Int16Array(bytes.buffer.slice(0, bytes.length - (bytes.length % 2)));
}

export type RecorderCallbacks = {
  onChunk: (base64Pcm: string) => void;
  onVoiceActivity: (voiced: boolean) => void;
};

// Captura del micrófono. start() pide permiso y arranca el worklet; stop() libera todo.
export class AudioRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async start(callbacks: RecorderCallbacks): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const context = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    this.context = context;

    const blob = new Blob([RECORDER_WORKLET], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    this.source = context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(context, "recorder-worklet");
    this.node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      const { pcm, rms } = event.data;
      callbacks.onVoiceActivity(rms >= VOICE_RMS_THRESHOLD);
      callbacks.onChunk(arrayBufferToBase64(pcm));
    };
    this.source.connect(this.node);
    // No conectamos a destination para no oírnos a nosotros mismos.
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.node = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}

// Reproducción de la voz del asistente, agendando chunks PCM en orden.
export class AudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private active = new Set<AudioBufferSourceNode>();

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.nextStartTime = this.context.currentTime;
    }
    return this.context;
  }

  enqueue(base64Pcm: string, sampleRate = OUTPUT_SAMPLE_RATE): void {
    const pcm = base64ToInt16(base64Pcm);
    if (pcm.length === 0) return;

    const context = this.ensureContext();
    void context.resume();

    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32768;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => this.active.delete(source);

    const startAt = Math.max(this.nextStartTime, context.currentTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.active.add(source);
  }

  // Barge-in: corta todo lo agendado cuando el usuario interrumpe.
  clear(): void {
    this.active.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ya terminó
      }
    });
    this.active.clear();
    if (this.context) {
      this.nextStartTime = this.context.currentTime;
    }
  }

  close(): void {
    this.clear();
    void this.context?.close();
    this.context = null;
  }
}
