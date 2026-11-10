import { useEffect, useMemo, useState } from "react";
import { Bot, Download, Image as ImageIcon, LoaderCircle, Power, RefreshCw, UserRound, X } from "lucide-react";

import {
  getFoodAutomationStatus,
  getFoodConversations,
  getFoodMessageMedia,
  getFoodMessages,
  getFoodOrders,
  getFoodRemoteMessageMedia,
  foodRemoteMediaUrl,
  runFoodAutomation,
  sendFoodRelayMessage,
  setFoodAutomationEnabled,
  setFoodConversationMode,
  setFoodCustomerAutomation,
  updateFoodOrderPayment,
  type FoodConversation,
  type FoodMessage,
} from "@/lib/food-api";

const formatDate = (value: string | null) => {
  if (!value) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
};

const displayName = (conversation: FoodConversation) => conversation.customer?.name || conversation.remoteJid.replace(/@.*$/, "");
const formatMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ConversationList({ conversations, selectedId, loading, testingId, onSelect, onTest }: { conversations: FoodConversation[]; selectedId: string | null; loading: boolean; testingId: string | null; onSelect: (id: string) => void; onTest: (conversation: FoodConversation) => void }) {
  if (loading && !conversations.length) return <p className="service-empty"><LoaderCircle className="animate-spin" size={18} />Carregando conversas…</p>;
  if (!conversations.length) return <p className="service-empty">Nenhum atendimento encontrado.</p>;
  return <div className="service-inbox-list">{conversations.map(conversation => <div className={`service-contact-row${selectedId === conversation.id ? " is-selected" : ""}`} key={conversation.id}>
    <button type="button" className="service-contact-select" aria-pressed={selectedId === conversation.id} onClick={() => onSelect(conversation.id)}>
      <span className="service-contact-avatar"><UserRound size={15} aria-hidden="true" /></span>
      <span className="service-contact-copy"><strong>{displayName(conversation)}</strong><small>{conversation.lastMessage?.body || (conversation.lastMessage?.mediaType === "audio" ? "Áudio recebido" : "Conversa iniciada")}</small><small>{formatDate(conversation.lastMessageAt)}</small></span>
      {conversation.automationPaused && <span className="service-human-dot" title="Atendimento assumido por um operador" />}
    </button>
    <button type="button" className={`service-contact-test${selectedId === conversation.id ? " is-selected" : ""}`} aria-pressed={selectedId === conversation.id} disabled={testingId !== null} onClick={() => onTest(conversation)} title={conversation.automationPaused ? "Retomar o bot somente durante este teste" : "Executar o bot nesta conversa"}>{testingId === conversation.id ? <LoaderCircle className="animate-spin" size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}{testingId === conversation.id ? "Testando…" : conversation.automationPaused ? "Retomar e testar" : "Testar bot"}</button>
  </div>)}</div>;
}

function MessageMedia({ conversation, message, large = false }: { conversation: FoodConversation; message: FoodMessage; large?: boolean }) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (message.mediaType !== "image") return undefined;
    let active = true;
    let objectUrl = "";
    const load = async () => {
      const attach = (blob: Blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      };
      try {
        attach(await getFoodMessageMedia(conversation.id, message.id));
        return;
      } catch {
        // No modo ponte a mídia fica no servidor remoto do WhatsApp.
      }
      try {
        attach(await getFoodRemoteMessageMedia(message.providerMessageId));
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversation.id, message.id, message.mediaType]);
  if (error) return <div className="service-media-fallback"><ImageIcon size={18} />Imagem indisponível</div>;
  if (!source) return <div className="service-media-loading"><LoaderCircle className="animate-spin" size={16} />Carregando imagem…</div>;
  return <img className={`service-message-image${large ? " is-large" : ""}`} src={source} alt="Imagem enviada pelo cliente no WhatsApp" />;
}

function MessageAudio({ message }: { message: FoodMessage }) {
  if (!message.providerMessageId) return <small className="service-audio-label">Áudio indisponível</small>;
  return <audio className="service-audio-player" controls preload="metadata" src={foodRemoteMediaUrl(message.providerMessageId)} />;
}

function MessageList({ messages, conversation, history = false }: { messages: FoodMessage[]; conversation: FoodConversation; history?: boolean }) {
  if (!messages.length) return <p className="service-empty">Nenhuma mensagem nesta conversa.</p>;
  return <div className={`service-message-list${history ? " is-history" : ""}`}>{messages.map(message => <article className={`service-message${message.direction === "outbound" ? " is-outbound" : ""}`} key={message.id}>
    <div className="service-message-meta"><strong>{message.direction === "outbound" && message.source === "human" ? "Atendente" : message.direction === "outbound" ? "Mosaico Food" : displayName(conversation)}</strong><span>{message.direction === "outbound" ? message.source === "human" ? "Enviada pelo atendente" : "Enviada" : "Recebida"} · {formatDate(message.createdAt)}</span></div>
    {message.mediaType === "image" && <MessageMedia conversation={conversation} message={message} />}
    {message.mediaType === "audio" && <MessageAudio message={message} />}
    {message.mediaType === "audio" && <small className="service-audio-label">{message.transcriptionStatus === "completed" ? "Áudio transcrito" : message.transcriptionStatus === "failed" ? "Áudio não transcrito" : "Áudio recebido"}</small>}
    {message.mediaType === "location" && message.locationLatitude != null && message.locationLongitude != null && <a className="service-location-card" href={`https://www.google.com/maps?q=${message.locationLatitude},${message.locationLongitude}`} target="_blank" rel="noreferrer"><span>Localização enviada pelo cliente</span><strong>Ver no mapa</strong><small>{message.locationAddress || `${message.locationLatitude.toFixed(6)}, ${message.locationLongitude.toFixed(6)}`}</small></a>}
    {message.body && <p>{message.body}</p>}
    {!message.body && !message.mediaType && <p>[mensagem sem texto]</p>}
  </article>)}</div>;
}

function HumanImagePrompt({ conversation, message, onClose, onOpenAssistant, onConfirmPayment, paymentBusy }: { conversation: FoodConversation; message: FoodMessage; onClose: () => void; onOpenAssistant: (product: string) => void; onConfirmPayment: () => void; paymentBusy: boolean }) {
  const [product, setProduct] = useState("");
  return <div className="service-human-modal-backdrop" role="presentation"><section className="service-human-modal" role="dialog" aria-modal="true" aria-labelledby="service-human-modal-title">
    <header><div><span>Imagem recebida</span><h2 id="service-human-modal-title">O que é esta imagem?</h2></div><button type="button" className="proto-subtle" onClick={onClose} aria-label="Fechar alerta"><X size={18} /></button></header>
    <p><strong>{displayName(conversation)}</strong> enviou uma imagem. Ela pode ser um comprovante de pagamento ou a foto de um produto/pedido.</p>
    <MessageMedia conversation={conversation} message={message} large />
    <div className="service-image-choice">
      <button type="button" onClick={onConfirmPayment} disabled={paymentBusy}>{paymentBusy ? "Marcando…" : "É comprovante de pagamento (Pix)"}</button>
      <small>O último pedido em aberto deste cliente será marcado como pago.</small>
    </div>
    <div className="service-image-product">
      <label>É produto ou pedido? Qual produto aparece na imagem?<input value={product} onChange={event => setProduct(event.target.value)} placeholder="Ex.: Bauru" /></label>
      <div className="service-human-modal-actions"><button type="button" className="proto-subtle" onClick={onClose}>Ver depois</button><button type="button" disabled={!product.trim()} onClick={() => onOpenAssistant(product.trim())}>Abrir registro do pedido</button></div>
    </div>
  </section></div>;
}
export function FoodServicePanel() {
  const [conversations, setConversations] = useState<FoodConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FoodMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [automation, setAutomation] = useState<{ enabled: boolean } | null>(null);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [contactBusy, setContactBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
        setSelectedId(current => {
          if (current && (next.length === 0 || next.some(conversation => conversation.id === current))) return current;
          return next[0]?.id ?? null;
        });
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

  const searchedConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return conversations;
    return conversations.filter(conversation => {
      const haystack = `${displayName(conversation)} ${conversation.remoteJid} ${conversation.lastMessage?.body ?? ""}`.toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });
  }, [conversations, search]);
  const visibleConversations = searchedConversations.slice(0, visibleCount);

  useEffect(() => { setVisibleCount(10); }, [search]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const next = await getFoodAutomationStatus();
        if (!disposed) setAutomation({ enabled: next.enabled });
      } catch {
        // O status do bot é complementar; a tela segue funcionando sem ele.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
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

  const toggleAutomation = async () => {
    if (!automation || automationBusy) return;
    setAutomationBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await setFoodAutomationEnabled(!automation.enabled);
      setAutomation({ enabled: next.enabled });
      setNotice(next.enabled ? "Atendimento automático ativado." : "Atendimento automático pausado.");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível alterar o atendimento automático.");
    } finally {
      setAutomationBusy(false);
    }
  };

  const testConversation = async (conversation: FoodConversation) => {
    if (testingId) return;
    setSelectedId(conversation.id);
    setError("");
    setNotice("");
    if (!conversation.customer?.automationEnabled) {
      setNotice(`O bot está desligado para ${displayName(conversation)}. Ative em "Ativar bot neste contato" antes de testar.`);
      return;
    }
    setTestingId(conversation.id);
    const wasPaused = conversation.automationPaused;
    try {
      if (!automation?.enabled) {
        const nextStatus = await setFoodAutomationEnabled(true);
        setAutomation({ enabled: nextStatus.enabled });
      }
      if (wasPaused) await setFoodConversationMode(conversation.id, false);
      const result = await runFoodAutomation(conversation.id, "relay", true, true);
      if (result.errors.length) throw new Error(result.errors.join(" "));
      const replies = result.replies ?? [];
      if (!result.processedMessages && !replies.length) {
        setNotice("O teste foi executado, mas não havia mensagem pendente para o bot responder.");
      } else {
        let sentCount = 0;
        const failures: string[] = [];
        for (const reply of replies) {
          try {
            await sendFoodRelayMessage(reply.remoteJid, reply.body);
            sentCount += 1;
          } catch (sendError) {
            failures.push(sendError instanceof Error ? sendError.message : "Falha ao enviar a resposta.");
          }
        }
        if (failures.length) {
          setError(`O bot gerou ${replies.length} resposta(s), mas ${failures.length} não foram enviadas: ${failures[0]}`);
        } else {
          setNotice(`Teste concluído: ${result.processedMessages} mensagem(ns) processada(s) e ${sentCount} resposta(s) enviada(s).`);
        }
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

  const toggleContactAutomation = async () => {
    const customer = selectedConversation?.customer;
    if (!customer || contactBusy) return;
    setContactBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await setFoodCustomerAutomation(customer.id, !customer.automationEnabled);
      setConversations(current => current.map(conversation => conversation.id === selectedConversation.id ? { ...conversation, customer: next.customer } : conversation));
      setNotice(next.customer.automationEnabled ? `Bot ativado para ${displayName(selectedConversation)}.` : `Bot pausado para ${displayName(selectedConversation)}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível alterar o bot deste contato.");
    } finally {
      setContactBusy(false);
    }
  };

  const confirmImagePayment = async () => {
    const customer = selectedConversation?.customer;
    if (!customer || paymentBusy) return;
    setPaymentBusy(true);
    setError("");
    setNotice("");
    try {
      const orders = await getFoodOrders();
      const pending = orders
        .filter(order => (order.customerId ?? order.customer?.id) === customer.id && order.status !== "cancelled" && order.paymentStatus !== "paid" && order.paymentStatus !== "cancelled")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (!pending) throw new Error("Nenhum pedido em aberto para este cliente. Marque o pagamento manualmente no Caixa.");
      const paid = await updateFoodOrderPayment(pending.id, "pix");
      setNotice(`Pedido de ${paid.customerName || displayName(selectedConversation)} marcado como pago via Pix (${formatMoney(paid.totalCents)}).`);
      dismissImagePrompt();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Não foi possível marcar o pedido como pago.");
    } finally {
      setPaymentBusy(false);
    }
  };

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setNotice("Buscando mensagens novas…");
    setError("");
    window.dispatchEvent(new Event("food-relay-sync"));
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const [nextConversations, nextMessages] = await Promise.all([
        getFoodConversations(),
        selectedId ? getFoodMessages(selectedId) : Promise.resolve<FoodMessage[]>([]),
      ]);
      setConversations(nextConversations);
      if (selectedId) setMessages(nextMessages);
      setNotice("Mensagens atualizadas.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Não foi possível sincronizar as mensagens.");
    } finally {
      setSyncing(false);
    }
  };

  const exportConversations = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    setNotice("Preparando exportação das conversas…");
    try {
      const all = await getFoodConversations();
      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
      const sections: string[] = [];
      for (let index = 0; index < all.length; index += 1) {
        const conversation = all[index];
        setNotice(`Exportando conversa ${index + 1} de ${all.length}…`);
        const messages = await getFoodMessages(conversation.id);
        const messageHtml = messages.map(message => {
          const outbound = message.direction === "outbound";
          const author = outbound && message.source === "human" ? "Atendente" : outbound ? "Mosaico Food" : displayName(conversation);
          const mediaUrl = message.providerMessageId ? foodRemoteMediaUrl(message.providerMessageId) : null;
          const media = message.mediaType === "image" && mediaUrl
            ? `<a href="${mediaUrl}" target="_blank" rel="noreferrer"><img src="${mediaUrl}" alt="Imagem da conversa" loading="lazy"></a>`
            : message.mediaType === "audio" && mediaUrl
              ? `<audio controls preload="none" src="${mediaUrl}"></audio>`
              : "";
          const body = message.body ? `<p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>` : "";
          return `<article class="message ${outbound ? "outbound" : "inbound"}"><header><strong>${escapeHtml(author)}</strong><span>${escapeHtml(formatDate(message.createdAt))}${message.mediaType ? ` · ${escapeHtml(message.mediaType)}` : ""}</span></header>${media}${body}</article>`;
        }).join("\n");
        sections.push(`<section class="conversation"><h2>${escapeHtml(displayName(conversation))}</h2><p class="meta">${escapeHtml(conversation.remoteJid)} · ${messages.length} mensagem(ns)</p>${messageHtml || "<p class=\"empty\">Sem mensagens.</p>"}</section>`);
      }
      const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Conversas do Mosaico Food</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;background:#f6f8f9;color:#14232d}
h1{font-size:22px;margin:0 0 4px}.sub{color:#5b6b74;margin:0 0 24px;font-size:13px}
.conversation{background:#fff;border:1px solid #dbe3e7;border-radius:12px;padding:16px;margin:0 0 18px;break-inside:avoid}
.conversation h2{margin:0;font-size:16px}.meta{margin:2px 0 12px;color:#5b6b74;font-size:12px}
.message{border-radius:10px;padding:8px 10px;margin:8px 0;max-width:80%}
.message.inbound{background:#eef3f5}.message.outbound{background:#dff3ec;margin-left:auto}
.message header{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#5b6b74;margin-bottom:4px}
.message p{margin:0;white-space:normal;font-size:13px;line-height:1.45}
.message img{max-width:320px;border-radius:8px;display:block;margin:6px 0}
.empty{color:#7a8a92;font-size:12px}
@media print{body{background:#fff;margin:0}.conversation{border:0;page-break-inside:avoid}}
</style></head><body>
<h1>Conversas do Mosaico Food</h1><p class="sub">Exportado em ${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()))} · ${all.length} conversa(s)</p>
${sections.join("\n")}
</body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mosaico-conversas-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Exportação concluída: ${all.length} conversa(s) em um arquivo HTML.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Não foi possível exportar as conversas.");
    } finally {
      setExporting(false);
    }
  };


  return <div className="service-page" aria-live="polite">
    <header className="service-page-heading"><div><span>Atendimento</span><h2>WhatsApp</h2></div><div className="service-heading-actions"><div className="service-sync-status"><span />Conversas sincronizadas</div><button type="button" className={`service-automation-toggle${automation?.enabled ? " is-on" : ""}`} onClick={() => void toggleAutomation()} disabled={automationBusy || !automation}><Power size={14} />{automation ? automation.enabled ? "Bot ativo" : "Bot pausado" : "Bot…"}</button><button type="button" className="service-export-button" onClick={() => void syncNow()} disabled={syncing}><RefreshCw className={syncing ? "animate-spin" : ""} size={14} />{syncing ? "Sincronizando…" : "Sincronizar"}</button><button type="button" className="service-export-button" onClick={() => void exportConversations()} disabled={exporting}><Download size={14} />{exporting ? "Exportando…" : "Exportar conversas"}</button></div></header>
    <div className="service-history-layout">
      <aside className="service-history-sidebar"><header><strong>Atendimentos</strong><small>{testingId ? "Teste do bot em andamento…" : "Teste o bot direto em cada contato"}</small></header><div className="service-search"><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar nome, telefone ou mensagem…" aria-label="Pesquisar conversas" /></div><ConversationList conversations={visibleConversations} selectedId={selectedId} loading={loading} testingId={testingId} onSelect={selectConversation} onTest={conversation => void testConversation(conversation)} />{searchedConversations.length > visibleCount && <button type="button" className="service-load-more" onClick={() => setVisibleCount(current => current + 10)}>Mostrar mais ({searchedConversations.length - visibleCount})</button>}<p className="service-result-count">{searchedConversations.length} conversa{searchedConversations.length === 1 ? "" : "s"}{search ? " encontrada(s)" : ""}</p></aside>
      <section className="service-history-panel"><header><div><span>Registro completo</span><h2>{selectedConversation ? displayName(selectedConversation) : "Histórico"}</h2></div><div className="service-history-actions">{selectedConversation?.customer && <button type="button" className={`service-contact-bot${selectedConversation.customer.automationEnabled ? " is-on" : ""}`} onClick={() => void toggleContactAutomation()} disabled={contactBusy}><Power size={13} />{selectedConversation.customer.automationEnabled ? "Bot neste contato ativo" : "Ativar bot neste contato"}</button>}{selectedConversation && <small>{messages.length} mensagem{messages.length === 1 ? "" : "ns"}</small>}</div></header>{selectedConversation ? <MessageList messages={messages} conversation={selectedConversation} history /> : <div className="service-no-selection"><Bot size={28} /><strong>Nenhum atendimento selecionado</strong><span>Escolha uma conversa para ver o que o cliente recebeu e o que foi enviado pelo bot.</span></div>}</section>
    </div>

    {testingId && <div className="service-testing-banner" role="status"><LoaderCircle className="animate-spin" size={16} />Teste do bot em andamento. Aguarde a resposta…</div>}
    {notice && <div className="service-feedback is-success" role="status">{notice}</div>}
    {error && <div className="service-feedback is-error" role="alert">{error}</div>}
    {humanImageMessage && selectedConversation && <HumanImagePrompt conversation={selectedConversation} message={humanImageMessage} onClose={dismissImagePrompt} onOpenAssistant={openAssistantForImage} onConfirmPayment={() => void confirmImagePayment()} paymentBusy={paymentBusy} />}
  </div>;
}
