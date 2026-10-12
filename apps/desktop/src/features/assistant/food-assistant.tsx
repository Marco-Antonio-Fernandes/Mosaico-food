import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Wand2, X } from "lucide-react";
import { assistantConfirm, assistantPreview, transcribeFoodAudio, type AssistantDraft } from "@/lib/food-api";

function writeWavString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

async function asWav(blob: Blob) {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return blob;

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const source = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        samples[index] += source[index] / decoded.numberOfChannels;
      }
    }

    const bytesPerSample = 2;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
    writeWavString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeWavString(view, 8, "WAVE");
    writeWavString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeWavString(view, 36, "data");
    view.setUint32(40, samples.length * bytesPerSample, true);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function FoodAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("Escreva ou fale o que aconteceu. Você confere antes de registrar.");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState("");
  const [payment, setPayment] = useState("pending");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number>();
  const alive = useRef(true);
  const upload = useRef(false);
  useEffect(() => {
    alive.current = true;
    const show = () => setOpen(true);
    window.addEventListener("food-open-assistant", show);
    return () => {
      alive.current = false; upload.current = false;
      window.removeEventListener("food-open-assistant", show);
      window.clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  async function interpret(productId?: string) {
    if (busy || recording || !text.trim()) return;
    setBusy(true); setDraft(null); setChoices([]);
    try {
      const result = await assistantPreview(text, productId);
      if (result.draft) {
        setDraft(result.draft); setTotal((result.draft.totalCents / 100).toFixed(2).replace(".", ","));
        setPayment(result.draft.paymentMethod ?? "pending"); setNotice("Confira os dados. Está certo?");
      } else { setNotice(result.message ?? "Não entendi. Pode escrever de outro jeito?"); setChoices(result.choices ?? []); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível interpretar."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!draft || busy) return;
    const cents = Math.round(Number(total.replace(",", ".")) * 100);
    if (!total.trim() || !Number.isSafeInteger(cents) || cents < 0) { setNotice("Confira o valor total."); return; }
    setBusy(true);
    try {
      const result = await assistantConfirm(draft.id, cents, payment === "pending" ? null : payment as "pix" | "cash" | "card");
      setNotice(result.message); setDraft(null); setText("");
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  }
  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microfone indisponível. Use o campo de texto.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      let bytes = 0;
      upload.current = true;
      capture.ondataavailable = event => {
        bytes += event.data.size;
        if (bytes > 8 * 1024 * 1024) { upload.current = false; setNotice("Áudio muito grande. Grave uma mensagem mais curta."); if (capture.state === "recording") capture.stop(); return; }
        if (event.data.size) chunks.push(event.data);
      };
      capture.onstop = async () => {
        window.clearTimeout(timer.current); media.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setRecording(false);
        if (!upload.current) { setBusy(false); return; }
        setBusy(true); setNotice("Transcrevendo…");
        try {
          const recordingBlob = new Blob(chunks, { type: capture.mimeType });
          const result = await transcribeFoodAudio(await asWav(recordingBlob));
          if (!alive.current) return;
          if (result.understood && result.text) { setText(result.text); setDraft(null); setChoices([]); setNotice("Confira o texto e toque em Entender."); }
          else setNotice(result.available === false
            ? "O motor de voz local não está instalado neste pacote. Instale uma versão com o Whisper ou escreva a mensagem."
            : "Desculpa, não consegui entender o que você disse. Pode repetir ou escrever a mensagem?");
        } catch { if (alive.current) setNotice("Desculpa, não consegui entender o que você disse. Pode repetir ou escrever a mensagem?"); }
        finally { if (alive.current) setBusy(false); }
      };
      capture.onerror = () => { upload.current = false; media.getTracks().forEach(track => track.stop()); setRecording(false); setBusy(false); setNotice("Não consegui gravar. Pode escrever a mensagem?"); };
      recorder.current = capture; capture.start(1000); setRecording(true); setBusy(false); setNotice("Ouvindo… Toque no quadrado para terminar.");
      timer.current = window.setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 115000);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop());
      setBusy(false);
      const name = error instanceof DOMException ? error.name : "";
      setNotice(name === "NotAllowedError" || name === "SecurityError"
        ? "O acesso ao microfone foi bloqueado. Autorize o microfone para o Mosaico Food e tente novamente."
        : name === "NotFoundError"
          ? "Nenhum microfone foi encontrado. Conecte um microfone e tente novamente."
          : error instanceof Error ? error.message : "Não foi possível abrir o microfone.");
    }
  }
  return <div className="food-assistant prototype">
    {open && <section className="proto-panel food-assistant-panel" aria-label="Assistente da loja">
      <header className="food-assistant-heading"><h2>Assistente da loja</h2><button type="button" className="proto-subtle" disabled={recording || busy} aria-label="Fechar assistente" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <p role="status">{notice}</p>
      <form onSubmit={event => { event.preventDefault(); void interpret(); }}>
        <label>O que aconteceu?<textarea autoFocus rows={3} maxLength={1000} disabled={busy || recording} value={text} placeholder="Vendi 5 pães no Pix por 6 reais · Fritei 5 pastéis" onChange={event => { setText(event.target.value); setDraft(null); setChoices([]); }} /></label>
        <div className="proto-toolbar"><button className={`food-assistant-record-button${recording ? " is-recording" : ""}`} type="button" disabled={busy} onClick={() => void record()} aria-pressed={recording} aria-label={recording ? "Terminar gravação" : "Gravar mensagem de voz"}>{recording ? <Square size={22} /> : <Mic size={22} />}<span>{recording ? "Parar gravação" : "Falar"}</span></button><button type="submit" disabled={busy || recording || !text.trim()}><Send size={18} /> Entender</button></div>
      </form>
      {choices.map(choice => <button type="button" key={choice.id} disabled={busy} onClick={() => void interpret(choice.id)}>{choice.name}</button>)}
      {draft && <div className="proto-ticket"><strong>{draft.action === "sale" ? "Venda" : "Produção"}: {draft.quantity} × {draft.productName}</strong>
        {draft.action === "sale" && <><label>Total da venda (R$)<input disabled={busy} inputMode="decimal" value={total} onChange={event => setTotal(event.target.value)} /></label><label>Pagamento recebido<select disabled={busy} value={payment} onChange={event => setPayment(event.target.value)}><option value="pending">Ainda não informado / pendente</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option></select></label></>}
        <button type="button" disabled={busy || recording} onClick={() => void confirm()}>{busy ? "Registrando…" : "Sim, registrar"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={() => setDraft(null)}>Corrigir</button>
      </div>}
    </section>}
    <button type="button" className={`food-assistant-toggle${recording ? " is-recording" : ""}`} aria-expanded={open} aria-label={recording ? "Assistente gravando áudio" : "Abrir assistente da loja"} onClick={() => setOpen(true)}><Wand2 aria-hidden="true" size={27} /><span>{recording ? "Gravando áudio…" : "Assistente da loja"}</span></button>
  </div>;
}
