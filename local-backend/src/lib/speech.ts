import { z } from "zod";

export const audioFallback = "Desculpa, não consegui entender o que você disse. Pode repetir ou escrever a mensagem?";
export const maxAudioBytes = 8 * 1024 * 1024;
const transcriptSchema = z.object({ text: z.string().max(5000), understood: z.boolean() });

export async function transcribeAudio(audio: Uint8Array, prompt = ""): Promise<string | null> {
  const token = process.env.SPEECH_TOKEN;
  if (!token || !audio.length || audio.length > maxAudioBytes) return null;
  try {
    const response = await fetch(`${(process.env.SPEECH_URL || "http://127.0.0.1:8787").replace(/\/$/, "")}/transcribe`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", ...(prompt ? { "X-Whisper-Prompt": prompt.slice(0, 4000) } : {}) },
      body: new Uint8Array(audio), signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) return null;
    const parsed = transcriptSchema.safeParse(await response.json());
    return parsed.success && parsed.data.understood && parsed.data.text.trim() ? parsed.data.text.trim() : null;
  } catch { return null; }
}
