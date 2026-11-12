import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { createFoodOrder, getFoodOrderSuggestions, type FoodOrderSuggestion, type FoodOrderSuggestionItem } from "@/lib/food-api";

const DISMISSED_KEY = "mosaico-dismissed-order-suggestions";

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
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as prévias de pedidos.");
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const remove = (suggestion: FoodOrderSuggestion) => {
    setSuggestions(current => current.filter(item => item.id !== suggestion.id));
  };

  const dismiss = (suggestion: FoodOrderSuggestion) => {
    saveDismissed([...loadDismissed(), suggestion.id]);
    remove(suggestion);
  };

  const changeQuantity = (suggestion: FoodOrderSuggestion, productId: string, quantity: number) => {
    const currentItems = edits[suggestion.id] ?? suggestion.items;
    const nextItems = currentItems
      .map(item => item.productId === productId ? { ...item, quantity: Math.max(0, quantity), totalCents: Math.max(0, quantity) * item.unitPriceCents } : item)
      .filter(item => item.quantity > 0);
    setEdits(current => ({ ...current, [suggestion.id]: nextItems }));
  };

  const approve = async (suggestion: FoodOrderSuggestion) => {
    if (busyId) return;
    const items = edits[suggestion.id] ?? suggestion.items;
    if (!items.length) {
      setError("A prévia não tem itens. Ajuste ou ignore.");
      return;
    }
    setBusyId(suggestion.id);
    setError("");
    setNotice("");
    try {
      await createFoodOrder({
        source: suggestion.origin === "owner" ? "balcao" : "whatsapp",
        customerName: suggestion.customerName || null,
        fulfillment: suggestion.fulfillment ?? "pickup",
        paymentMethod: (suggestion.paymentMethod as never) ?? null,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          variantName: item.variantName,
        })),
      });
      setNotice("Pedido aprovado.");
      remove(suggestion);
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aprovar o pedido.");
    } finally {
      setBusyId(null);
    }
  };

  if (!suggestions.length) {
    return error ? <p className="food-backup-error">{error}</p> : null;
  }

  return <section className="order-suggestions order-suggestions-compact" aria-label="Prévias de pedidos">
    <header>
      <div><strong>Prévias de pedidos</strong><small>{suggestions.length} para aprovar</small></div>
      {notice && <span className="order-suggestions-notice">{notice}</span>}
    </header>
    {error && <p className="food-backup-error">{error}</p>}
    <div className="order-suggestion-compact-list">
      {suggestions.map(suggestion => {
        const items = edits[suggestion.id] ?? suggestion.items;
        return <article className="order-suggestion-compact" key={suggestion.id}>
          <div className="order-suggestion-compact-items">
            {items.map(item => <div key={`${item.productId}:${item.variantId ?? ""}`}>
              <input type="number" min="1" step="1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => changeQuantity(suggestion, item.productId, Number(event.target.value) || 0)} />
              <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
            </div>)}
          </div>
          <div className="order-suggestion-compact-actions">
            <button type="button" onClick={() => void approve(suggestion)} disabled={busyId === suggestion.id}><Check size={14} />{busyId === suggestion.id ? "Aprovando…" : "Aprovar"}</button>
            <button type="button" className="proto-subtle" onClick={() => dismiss(suggestion)} disabled={busyId === suggestion.id}><X size={14} />Ignorar</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
