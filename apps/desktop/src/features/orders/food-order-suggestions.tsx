import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, MessageCircle, Trash2 } from "lucide-react";

import { createFoodOrder, getFoodOrderSuggestions, type FoodOrderSuggestion, type FoodOrderSuggestionItem, type SalePaymentMethod } from "@/lib/food-api";

const DISMISSED_KEY = "mosaico-dismissed-order-suggestions";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function loadDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveDismissed(ids: string[]) {
  try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-300))); } catch { /* preferência local opcional */ }
}

export function FoodOrderSuggestions() {
  const [suggestions, setSuggestions] = useState<FoodOrderSuggestion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, FoodOrderSuggestionItem[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const dismissed = new Set(loadDismissed());
      const next = (await getFoodOrderSuggestions()).filter(suggestion => !dismissed.has(suggestion.id));
      setSuggestions(next);
      setEdits(current => {
        const updated: Record<string, FoodOrderSuggestionItem[]> = {};
        for (const suggestion of next) updated[suggestion.id] = current[suggestion.id] ?? suggestion.items;
        return updated;
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as sugestões do WhatsApp.");
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const dismiss = (suggestion: FoodOrderSuggestion) => {
    saveDismissed([...loadDismissed(), suggestion.id]);
    setSuggestions(current => current.filter(item => item.id !== suggestion.id));
    setExpandedId(current => current === suggestion.id ? null : current);
  };

  const changeQuantity = (suggestion: FoodOrderSuggestion, productId: string, quantity: number) => {
    setEdits(current => ({
      ...current,
      [suggestion.id]: (current[suggestion.id] ?? suggestion.items)
        .map(item => item.productId === productId ? { ...item, quantity: Math.max(0, quantity), totalCents: Math.max(0, quantity) * item.unitPriceCents } : item)
        .filter(item => item.quantity > 0),
    }));
  };

  const confirm = async (suggestion: FoodOrderSuggestion) => {
    if (busyId) return;
    const items = edits[suggestion.id] ?? suggestion.items;
    if (!items.length) {
      setError("A sugestão não tem itens. Edite ou ignore.");
      return;
    }
    setBusyId(suggestion.id);
    setError("");
    setNotice("");
    try {
      const order = await createFoodOrder({
        source: "whatsapp",
        customerName: suggestion.customerName,
        fulfillment: suggestion.fulfillment ?? "pickup",
        paymentMethod: (suggestion.paymentMethod as SalePaymentMethod | null) ?? null,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          variantName: item.variantName,
        })),
      });
      setNotice(`Pedido de ${suggestion.customerName} criado (${money(order.totalCents)}).`);
      dismiss(suggestion);
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o pedido.");
    } finally {
      setBusyId(null);
    }
  };

  if (!suggestions.length) {
    return error ? <p className="food-backup-error">{error}</p> : null;
  }

  return <section className="order-suggestions" aria-label="Pedidos sugeridos">
    <header>
      <div><strong>Pedidos sugeridos</strong><small>{suggestions.length} aguardando confirmação</small></div>
      {notice && <span className="order-suggestions-notice">{notice}</span>}
    </header>
    {error && <p className="food-backup-error">{error}</p>}
    <div className="order-suggestions-list">
      {suggestions.map(suggestion => {
        const items = edits[suggestion.id] ?? suggestion.items;
        const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
        const open = expandedId === suggestion.id;
        return <article className={`order-suggestion${open ? " is-open" : ""}`} key={suggestion.id}>
          <button type="button" className="order-suggestion-summary" aria-expanded={open} onClick={() => setExpandedId(open ? null : suggestion.id)}>
            <MessageCircle size={14} />
            <strong>{suggestion.customerName}</strong>
            <small>{items.length} item(ns)</small>
            <span>{money(total)}</span>
            <ChevronDown size={15} />
          </button>
          {open && <div className="order-suggestion-body">
            <small className="order-suggestion-text">{suggestion.text.replace(/\n/g, " · ").slice(0, 160)}</small>
            <div className="order-suggestion-items">
              {items.map(item => <div key={item.productId}>
                <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
                <input type="number" min="1" step="1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => changeQuantity(suggestion, item.productId, Number(event.target.value) || 0)} />
                <strong>{money(item.quantity * item.unitPriceCents)}</strong>
              </div>)}
            </div>
            <div className="proto-toolbar">
              <button type="button" onClick={() => void confirm(suggestion)} disabled={busyId === suggestion.id}>{busyId === suggestion.id ? "Criando…" : "Confirmar pedido"}</button>
              <button type="button" className="proto-subtle" onClick={() => dismiss(suggestion)} disabled={busyId === suggestion.id}><Trash2 size={14} /> Ignorar</button>
              <span role="status">{notice && busyId === null ? <><CheckCircle2 size={13} />{notice}</> : ""}</span>
            </div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
