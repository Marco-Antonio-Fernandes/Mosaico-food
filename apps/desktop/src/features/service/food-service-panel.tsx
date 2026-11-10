import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";

function whatsappAccountId(): string {
  try {
    const raw = window.localStorage.getItem("mosaico-active-account");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const id = parsed && typeof parsed === "object" && typeof (parsed as { id?: unknown }).id === "string" ? (parsed as { id: string }).id : "default";
    return id;
  } catch {
    return "default";
  }
}

export function FoodServicePanel() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<{ state: string; message: string }>({ state: "loading", message: "Carregando WhatsApp Web…" });
  const isDesktop = Boolean(window.mosaicoDesktop?.showWhatsApp);
  const accountId = whatsappAccountId();

  useEffect(() => {
    const bridge = window.mosaicoDesktop;
    if (!isDesktop || !bridge?.showWhatsApp) return undefined;
    let active = true;
    const unsubscribe = bridge.onWhatsAppStatus?.(next => {
      if (active) setStatus(next);
    });
    void bridge.showWhatsApp(accountId).catch(error => {
      if (active) setStatus({ state: "error", message: error instanceof Error ? error.message : "Não foi possível abrir o WhatsApp Web." });
    });
    return () => {
      active = false;
      unsubscribe?.();
      void bridge.hideWhatsApp?.();
    };
  }, [accountId, isDesktop]);

  useLayoutEffect(() => {
    const bridge = window.mosaicoDesktop;
    const host = hostRef.current;
    if (!isDesktop || !bridge?.setWhatsAppBounds || !host) return undefined;
    let frame: number | null = null;
    const reportBounds = () => {
      frame = null;
      const rect = host.getBoundingClientRect();
      bridge.setWhatsAppBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(reportBounds);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(host);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    reportBounds();
    return () => {
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [accountId, isDesktop]);

  const reload = () => {
    void window.mosaicoDesktop?.reloadWhatsApp?.();
  };

  return <div className="service-wa-only-layout"><section className="service-wa-embed" aria-label="WhatsApp Web">
    <header>
      <div>
        <strong>WhatsApp Web</strong>
        <small>{isDesktop ? status.state === "error" ? status.message : "Atendimento manual · o robô não responde mais" : "Disponível no aplicativo desktop"}</small>
      </div>
      <button type="button" className="service-wa-reload" onClick={reload} aria-label="Recarregar WhatsApp Web"><RefreshCw size={15} /></button>
    </header>
    {isDesktop ? <div ref={hostRef} className="service-wa-native-host" aria-label="Área do WhatsApp Web" /> : <div className="service-wa-fallback"><MessageCircle size={28} /><strong>Abra o Mosaico no aplicativo desktop</strong><span>O WhatsApp Web usa uma sessão persistente separada para a conta ativa.</span></div>}
  </section></div>;
}
