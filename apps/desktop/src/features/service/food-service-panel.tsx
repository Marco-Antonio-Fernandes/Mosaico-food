import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, Image as ImageIcon, LoaderCircle, MessageCircle, RefreshCw, UserRound, X } from "lucide-react";

import {
  getFoodConversations,
  getFoodMessageMedia,
  getFoodMessages,
  exportFoodConversationLog,
  runFoodAutomation,
  setFoodConversationMode,
  type FoodConversation,
  type FoodMessage,
} from "@/lib/food-api";

const formatDate = (value: string | null) => {
  if (!value) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
};

const displayName = (conversation: FoodConversation) => conversation.customer?.name || conversation.remoteJid.replace(/@.*$/, "");

function ConversationList({ conversations, selectedId, loading, testingId, onSelect, onTest }: { conversations: FoodConversation[]; selectedId: string | null; loading: boolean; testingId: string | null; onSelect: (id: string) => void; onTest: (conversation: FoodConversation) => void }) {
  if (loading && !conversations.length) return <p className="service-empty"><LoaderCircle className="animate-spin" size={18} />Carregando conversas…</p>;
  if (!conversations.length) return <p className="service-empty">Nenhum atendimento recebido ainda.</p>;
  return <div className="service-inbox-list">{conversations.map(conversation => <div className={`service-contact-row${selectedId === conversation.id ? " is-selected" : ""}`} key={conversation.id}>
    <button type="button" className="service-contact-select" aria-pressed={selectedId === conversation.id} onClick={() => onSelect(conversation.id)}>
      <span className="service-contact-avatar"><UserRound size={15} aria-hidden="true" /></span>
      <span className="service-contact-copy"><strong>{displayName(conversation)}</strong><small>{conversation.lastMessage?.body || (conversation.lastMessage?.mediaType === "audio" ? "Áudio recebido" : "Conversa iniciada")}</small><small>{formatDate(conversation.lastMessageAt)}</small></span>
      {conversation.automationPaused && <span className="service-human-dot" title="Atendimento assumido por um operador" />}
    </button>
    <button type="button" className="service-contact-test" disabled={testingId !== null} onClick={() => onTest(conversation)} title={conversation.automationPaused ? "Retomar o bot somente durante este teste" : "Executar o bot nesta conversa"}><Bot size={13} aria-hidden="true" />{testingId === conversation.id ? "Testando…" : conversation.automationPaused ? "Retomar e testar" : "Testar bot"}</button>
  </div>)}</div>;
}

function MessageMedia({ conversation, message, large = false }: { conversation: FoodConversation; message: FoodMessage; large?: boolean }) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (message.mediaType !== "image") return undefined;
    let active = true;
    let objectUrl = "";
    void getFoodMessageMedia(conversation.id, message.id).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversation.id, message.id, message.mediaType]);
  if (error) return <div className="service-media-fallback"><ImageIcon size={18} />Imagem indisponível</div>;
  if (!source) return <div className="service-media-loading"><LoaderCircle className="animate-spin" size={16} />Carregando imagem…</div>;
  return <img className={`service-message-image${large ? " is-large" : ""}`} src={source} alt="Imagem enviada pelo cliente no WhatsApp" />;
}

function MessageList({ messages, conversation, history = false }: { messages: FoodMessage[]; conversation: FoodConversation; history?: boolean }) {
  if (!messages.length) return <p className="service-empty">Nenhuma mensagem nesta conversa.</p>;
  return <div className={`service-message-list${history ? " is-history" : ""}`}>{messages.map(message => <article className={`service-message${message.direction === "outbound" ? " is-outbound" : ""}`} key={message.id}>
    <div className="service-message-meta"><strong>{message.direction === "outbound" && message.source === "human" ? "Atendente" : message.direction === "outbound" ? "Mosaico Food" : displayName(conversation)}</strong><span>{message.direction === "outbound" ? message.source === "human" ? "Enviada pelo atendente" : "Enviada" : "Recebida"} · {formatDate(message.createdAt)}</span></div>
    {message.mediaType === "image" && <MessageMedia conversation={conversation} message={message} />}
    {message.mediaType === "audio" && <small className="service-audio-label">{message.transcriptionStatus === "completed" ? "Áudio transcrito" : message.transcriptionStatus === "failed" ? "Áudio não transcrito" : "Áudio recebido"}</small>}
    {message.mediaType === "location" && message.locationLatitude != null && message.locationLongitude != null && <a className="service-location-card" href={`https://www.google.com/maps?q=${message.locationLatitude},${message.locationLongitude}`} target="_blank" rel="noreferrer"><span>Localização enviada pelo cliente</span><strong>Ver no mapa</strong><small>{message.locationAddress || `${message.locationLatitude.toFixed(6)}, ${message.locationLongitude.toFixed(6)}`}</small></a>}
    <p>{message.body || (message.mediaType === "audio" ? "[áudio recebido]" : message.mediaType === "location" ? "[localização recebida]" : "[mensagem sem texto]")}</p>
  </article>)}</div>;
}

function HumanImagePrompt({ conversation, message, onClose, onOpenAssistant }: { conversation: FoodConversation; message: FoodMessage; onClose: () => void; onOpenAssistant: (product: string) => void }) {
  const [product, setProduct] = useState("");
  return <div className="service-human-modal-backdrop" role="presentation"><section className="service-human-modal" role="dialog" aria-modal="true" aria-labelledby="service-human-modal-title">
    <header><div><span>Resposta humana necessária</span><h2 id="service-human-modal-title">O cliente apontou para uma imagem</h2></div><button type="button" className="proto-subtle" onClick={onClose} aria-label="Fechar alerta"><X size={18} /></button></header>
    <p><strong>{displayName(conversation)}</strong> escreveu algo como “dois desses”. O bot não vai adivinhar o produto da imagem.</p>
    <MessageMedia conversation={conversation} message={message} large />
    <label>Qual produto aparece na imagem?<input autoFocus value={product} onChange={event => setProduct(event.target.value)} placeholder="Ex.: Bauru" /></label>
    <small>Identifique o item e registre o pedido manualmente no Assistente da loja.</small>
    <div className="service-human-modal-actions"><button type="button" className="proto-subtle" onClick={onClose}>Ver depois</button><button type="button" disabled={!product.trim()} onClick={() => onOpenAssistant(product.trim())}>Abrir registro do pedido</button></div>
  </section></div>;
}

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

function WhatsAppWebEmbed() {
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

  return <section className="service-wa-embed" aria-label="WhatsApp Web">
    <header><div><strong>WhatsApp Web</strong><small>{isDesktop ? status.state === "error" ? status.message : "Sessão persistente da conta ativa" : "Disponível no aplicativo desktop"}</small></div><button type="button" className="service-wa-reload" onClick={reload} aria-label="Recarregar WhatsApp Web"><RefreshCw size={15} /></button></header>
    {isDesktop ? <div ref={hostRef} className="service-wa-native-host" aria-label="Área do WhatsApp Web" /> : <div className="service-wa-fallback"><MessageCircle size={28} /><strong>Abra o Mosaico no aplicativo desktop</strong><span>O WhatsApp Web usa uma sessão persistente separada para a conta ativa.</span></div>}
  </section>;
}

export function FoodServicePanel() {
  const [view, setView] = useState<"whatsapp" | "history">("whatsapp");
  const [conversations, setConversations] = useState<FoodConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FoodMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dismissedImageMessages, setDismissedImageMessages] = useState<string[]>([]);

  const selectedConversation = useMemo(
    () => conversations.find(conversation => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const humanImageMessage = useMemo(() => {
    if (!selectedConversation) return null;
    return [...messages].reverse().find(message => message.direction === "inbound" && message.mediaType === "image" && message.needsHuman && !dismissedImageMessages.includes(message.id)) ?? null;
  }, [dismissedImageMessages, messages, selectedConversation]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const next = await getFoodConversations();
        if (disposed) return;
        setConversations(next);
        setSelectedId(current => current && next.some(conversation => conversation.id === current) ? current : next[0]?.id ?? null);
        setError("");
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os atendimentos.");
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const next = await getFoodMessages(selectedId);
        if (!disposed) {
          setMessages(next);
          setError("");
        }
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as mensagens.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [selectedId]);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setError("");
    setNotice("");
  };

  const dismissImagePrompt = () => {
    if (humanImageMessage) setDismissedImageMessages(current => [...current, humanImageMessage.id]);
  };

  const openAssistantForImage = (product: string) => {
    setNotice(`Produto identificado como “${product}”. Registre a quantidade e o pagamento no Assistente da loja.`);
    dismissImagePrompt();
    window.dispatchEvent(new Event("food-open-assistant"));
  };

  const testConversation = async (conversation: FoodConversation) => {
    if (testingId) return;
    setSelectedId(conversation.id);
    setTestingId(conversation.id);
    setError("");
    setNotice("");
    const wasPaused = conversation.automationPaused;
    try {
      if (wasPaused) await setFoodConversationMode(conversation.id, false);
      const result = await runFoodAutomation(conversation.id);
      if (result.errors.length) throw new Error(result.errors.join(" "));
      if (!result.processedMessages && !result.repliesSent) {
        setNotice("O teste foi executado, mas não havia mensagem pendente para o bot responder.");
      } else {
        setNotice(`Teste concluído: ${result.processedMessages} mensagem(ns) processada(s) e ${result.repliesSent} resposta(s) enviada(s).`);
      }
      const [nextConversations, nextMessages] = await Promise.all([getFoodConversations(), getFoodMessages(conversation.id)]);
      setConversations(nextConversations);
      setMessages(nextMessages);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Não foi possível testar o bot nesta conversa.");
    } finally {
      if (wasPaused) {
        try {
          const restored = await setFoodConversationMode(conversation.id, true);
          setConversations(current => current.map(item => item.id === restored.id ? { ...item, automationPaused: restored.automationPaused } : item));
        } catch {
          setError("O teste terminou, mas não foi possível pausar novamente este atendimento.");
        }
      }
      setTestingId(null);
    }
  };

  const exportConversationLog = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const data = await exportFoodConversationLog();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mosaico-atendimento-${data.period.from}${data.period.to !== data.period.from ? `_${data.period.to}` : ""}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Arquivo do atendimento salvo: ${data.period.from}${data.period.to !== data.period.from ? ` até ${data.period.to}` : ""}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Não foi possível exportar o atendimento.");
    } finally {
      setExporting(false);
    }
  };

  return <div className="service-page" aria-live="polite">
    <header className="service-page-heading"><div><span>Atendimento</span><h2>WhatsApp</h2></div><div className="service-heading-actions"><div className="service-sync-status"><span />Conversas sincronizadas</div><button type="button" className="service-export-button" onClick={() => void exportConversationLog()} disabled={exporting}><Download size={14} />{exporting ? "Preparando…" : "Baixar conversas do dia"}</button></div></header>
    <div className="service-tabs" role="tablist" aria-label="Visualização do atendimento">
      <button type="button" role="tab" aria-selected={view === "whatsapp"} onClick={() => setView("whatsapp")}><MessageCircle size={16} />WhatsApp Web</button>
      <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")}><Bot size={16} />Histórico do atendimento</button>
    </div>

    {view === "whatsapp" ? <div className="service-wa-only-layout"><WhatsAppWebEmbed /></div> : <div className="service-history-layout">
      <aside className="service-history-sidebar"><header><strong>Atendimentos</strong><small>Teste o bot direto em cada contato</small></header><ConversationList conversations={conversations} selectedId={selectedId} loading={loading} testingId={testingId} onSelect={selectConversation} onTest={conversation => void testConversation(conversation)} /></aside>
      <section className="service-history-panel"><header><div><span>Registro completo</span><h2>{selectedConversation ? displayName(selectedConversation) : "Histórico"}</h2></div>{selectedConversation && <small>{messages.length} mensagem{messages.length === 1 ? "" : "ns"}</small>}</header>{selectedConversation ? <MessageList messages={messages} conversation={selectedConversation} history /> : <div className="service-no-selection"><Bot size={28} /><strong>Nenhum atendimento selecionado</strong><span>Escolha uma conversa para ver o que o cliente recebeu e o que foi enviado pelo bot.</span></div>}</section>
    </div>}

    {notice && <div className="service-feedback is-success" role="status">{notice}</div>}
    {error && <div className="service-feedback is-error" role="alert">{error}</div>}
    {humanImageMessage && selectedConversation && <HumanImagePrompt conversation={selectedConversation} message={humanImageMessage} onClose={dismissImagePrompt} onOpenAssistant={openAssistantForImage} />}
  </div>;
}
