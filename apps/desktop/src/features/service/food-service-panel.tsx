import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, Send, UserRound } from "lucide-react";

import { Badge, Panel } from "@/components/shared/prototype-kit";
import {
  getFoodConversations,
  getFoodMessages,
  sendFoodMessage,
  setFoodCustomerAutomation,
  setFoodConversationMode,
  type FoodConversation,
  type FoodMessage,
} from "@/lib/food-api";

const formatDate = (value: string | null) => {
  if (!value) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
};

const displayName = (conversation: FoodConversation) => conversation.customer?.name || conversation.remoteJid.replace(/@.*$/, "");

const automationLabel = (conversation: FoodConversation) => {
  if (!conversation.customer?.automationEnabled) return "Teste inativo";
  return conversation.automationPaused ? "Humano" : "Automático";
};

export function FoodServicePanel() {
  const [conversations, setConversations] = useState<FoodConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FoodMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const next = await getFoodConversations();
        if (disposed) return;
        setConversations(next);
        setSelectedId((current) => current && next.some((conversation) => conversation.id === current) ? current : next[0]?.id ?? null);
        setError("");
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os atendimentos.");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
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
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !draft.trim() || sending) return;

    setSending(true);
    setNotice("");
    try {
      const message = await sendFoodMessage(selectedId, draft.trim());
      setMessages((current) => [...current, message]);
      setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, automationPaused: true } : conversation));
      setDraft("");
      setNotice("Mensagem enviada pelo WhatsApp; automação pausada para este atendimento.");
      setError("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  const toggleAutomation = async () => {
    if (!selectedConversation) return;
    try {
      const updated = await setFoodConversationMode(selectedConversation.id, !selectedConversation.automationPaused);
      setConversations((current) => current.map((conversation) => conversation.id === updated.id ? { ...conversation, automationPaused: updated.automationPaused } : conversation));
      setNotice(updated.automationPaused ? "Atendimento assumido por um operador." : "Atendimento automático devolvido.");
      setError("");
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : "Não foi possível alterar o modo do atendimento.");
    }
  };

  const toggleCustomerAutomation = async () => {
    const customer = selectedConversation?.customer;
    if (!customer) return;

    const enabled = !customer.automationEnabled;
    try {
      const result = await setFoodCustomerAutomation(customer.id, enabled);
      setConversations((current) => current.map((conversation) => conversation.customer?.id === customer.id
        ? {
            ...conversation,
            customer: result.customer,
            automationPaused: !enabled,
          }
        : conversation));
      setNotice(enabled
        ? "Teste ativado para este contato. As mensagens pendentes serão respondidas automaticamente."
        : "Teste desativado para este contato. Nenhuma resposta automática será enviada.");
      setError("");
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : "Não foi possível alterar o teste deste contato.");
    }
  };

  return <div className="proto-chat" aria-live="polite">
    <Panel title="Conversas" subtitle="WhatsApp conectado ao Mosaico Food">
      {loading && !conversations.length ? <p className="proto-empty"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20} />Carregando atendimentos…</p> : conversations.length ? <div className="proto-conversations">{conversations.map((conversation) => <button type="button" key={conversation.id} aria-pressed={selectedId === conversation.id} onClick={() => { setSelectedId(conversation.id); setNotice(""); }}>
        <strong className="flex items-center gap-2"><UserRound size={15} />{displayName(conversation)}</strong>
        <small>{conversation.lastMessage?.body || "Conversa iniciada"}</small>
        <small>{formatDate(conversation.lastMessageAt)} · {automationLabel(conversation)}</small>
      </button>)}</div> : <p className="proto-empty">Nenhum atendimento recebido ainda. Quando o webhook chegar, a conversa aparecerá aqui.</p>}
    </Panel>

    <Panel title={selectedConversation ? displayName(selectedConversation) : "Atendimento"} subtitle={selectedConversation ? `${selectedConversation.remoteJid.replace(/@.*$/, "")} · ${automationLabel(selectedConversation)}` : "Selecione uma conversa"}>
      {selectedConversation && <>
        <div className="proto-toolbar">
          <Badge>{selectedConversation.state}</Badge>
          <button type="button" className="proto-subtle" onClick={() => void toggleCustomerAutomation()}><Bot size={15} />{selectedConversation.customer?.automationEnabled ? "Desativar teste" : "Ativar teste"}</button>
          {selectedConversation.customer?.automationEnabled && <button type="button" className="proto-subtle" onClick={() => void toggleAutomation()}>{selectedConversation.automationPaused ? "Devolver à automação" : "Assumir atendimento"}</button>}
        </div>
        <div className="proto-messages">{messages.length ? messages.map((message) => <p className={message.direction === "outbound" ? "outgoing" : ""} key={message.id}>{message.mediaType === "audio" && <small>{message.transcriptionStatus === "completed" ? "Áudio transcrito" : message.transcriptionStatus === "failed" ? "Não foi possível entender o áudio" : "Áudio aguardando transcrição"}</small>}{message.body || (message.mediaType === "audio" ? "[áudio recebido]" : "[mensagem sem texto]")}<small>{message.direction === "outbound" ? "Mosaico Food" : displayName(selectedConversation)} · {formatDate(message.createdAt)}</small></p>) : <p className="proto-empty">Nenhuma mensagem nesta conversa.</p>}</div>
        <form className="proto-toolbar" onSubmit={send}>
          <label className="min-w-0 flex-1">Mensagem<input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem…" maxLength={5000} disabled={sending} /></label>
          <button type="submit" disabled={sending || !draft.trim()}><Send size={15} />{sending ? "Enviando…" : "Enviar"}</button>
        </form>
      </>}
      {!selectedConversation && !loading && <p className="proto-empty">Selecione uma conversa para acompanhar e responder.</p>}
    </Panel>

    <Panel title="Estado do atendimento" subtitle="Dados persistidos no backend">
      {selectedConversation ? <dl className="proto-facts"><div><dt>Cliente</dt><dd>{displayName(selectedConversation)}</dd></div><div><dt>Telefone</dt><dd>{selectedConversation.remoteJid.replace(/@.*$/, "")}</dd></div><div><dt>Teste automático</dt><dd>{selectedConversation.customer?.automationEnabled ? "Ativo" : "Inativo"}</dd></div><div><dt>Modo</dt><dd>{automationLabel(selectedConversation)}</dd></div><div><dt>Última mensagem</dt><dd>{formatDate(selectedConversation.lastMessageAt)}</dd></div></dl> : <p className="proto-empty">Nenhuma conversa selecionada.</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><MessageCircle size={14} />As mensagens são enviadas pelo backend usando a sessão WA-AKG configurada.</p>
    </Panel>
  </div>;
}
