import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, MessageCircle, Store, Trash2, User } from "lucide-react";

import { createFoodOrder, getFoodOrderSuggestions, type FoodOrderSuggestion, type FoodOrderItemInput, type FoodOrderSuggestionItem, type SalePaymentMethod } from "@/lib/food-api";

const DISMISSED_KEY = "mosaico-dismissed-order-suggestions";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentLabel: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card_credit: "Crédito", card_debit: "Débito", meal_voucher: "Vale-alimentação", crediario: "Crediário", brinde: "Brinde" };
const paymentOptions = Object.entries(paymentLabel);

type SuggestionDetails = {
  customerName: string;
  paymentMethod: string;
  fulfillment: "pickup" | "delivery";
  total: string;
};

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

function parseMoney(value: string) {
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function FoodOrderSuggestions() {
  const [suggestions, setSuggestions] = useState<FoodOrderSuggestion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, FoodOrderSuggestionItem[]>>({});
  const [details, setDetails] = useState<Record<string, SuggestionDetails>>({});
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
      setDetails(current => {
        const updated = { ...current };
        for (const suggestion of next) {
          updated[suggestion.id] ??= {
            customerName: suggestion.customerName,
            paymentMethod: suggestion.paymentMethod ?? "",
            fulfillment: suggestion.fulfillment ?? "pickup",
            total: moneyInput(suggestion.totalCents),
          };
        }
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
    const currentItems = edits[suggestion.id] ?? suggestion.items;
    const nextItems = currentItems
      .map(item => item.productId === productId ? { ...item, quantity: Math.max(0, quantity), totalCents: Math.max(0, quantity) * item.unitPriceCents } : item)
      .filter(item => item.quantity > 0);
    setEdits(current => ({ ...current, [suggestion.id]: nextItems }));
    setDetails(current => {
      const info = current[suggestion.id];
      if (!info) return current;
      return { ...current, [suggestion.id]: { ...info, total: moneyInput(nextItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)) } };
    });
  };

  const changeDetails = (suggestionId: string, changes: Partial<SuggestionDetails>) => {
    setDetails(current => {
      const info = current[suggestionId];
      if (!info) return current;
      return { ...current, [suggestionId]: { ...info, ...changes } };
    });
  };

  const confirm = async (suggestion: FoodOrderSuggestion) => {
    if (busyId) return;
    const items = edits[suggestion.id] ?? suggestion.items;
    const info = details[suggestion.id];
    if (!items.length || !info) {
      setError("A sugestão não tem itens. Edite ou ignore.");
      return;
    }
    const desiredTotal = parseMoney(info.total);
    const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const payloadItems: FoodOrderItemInput[] = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantName: item.variantName,
    }));
    const difference = desiredTotal - itemsTotal;
    if (difference !== 0 && itemsTotal > 0) {
      let remaining = difference;
      for (const item of payloadItems) {
        const share = Math.trunc(difference * (item.quantity * item.unitPriceCents) / itemsTotal);
        const perUnit = Math.trunc(share / item.quantity);
        if (item.unitPriceCents + perUnit < 0) {
          setError("O total informado é menor que o valor mínimo dos itens.");
          return;
        }
        item.unitPriceCents += perUnit;
        item.adjustmentCents = perUnit;
        item.adjustmentNote = "Total informado na anotação";
        remaining -= perUnit * item.quantity;
      }
      if (remaining !== 0) {
        const last = payloadItems[payloadItems.length - 1];
        const adjustedUnitPrice = last.unitPriceCents + remaining;
        if (adjustedUnitPrice < 0) {
          setError("O total informado é menor que o valor mínimo dos itens.");
          return;
        }
        if (last.quantity > 1) {
          payloadItems.splice(payloadItems.length - 1, 1,
            { ...last, quantity: last.quantity - 1 },
            { ...last, quantity: 1, unitPriceCents: adjustedUnitPrice, adjustmentCents: (last.adjustmentCents ?? 0) + remaining, adjustmentNote: "Total informado na anotação" },
          );
        } else {
          last.unitPriceCents = adjustedUnitPrice;
          last.adjustmentCents = (last.adjustmentCents ?? 0) + remaining;
          last.adjustmentNote = "Total informado na anotação";
        }
      }
    }
    setBusyId(suggestion.id);
    setError("");
    setNotice("");
    try {
      const order = await createFoodOrder({
        source: suggestion.origin === "owner" ? "balcao" : "whatsapp",
        customerName: info.customerName.trim() || suggestion.customerName,
        fulfillment: info.fulfillment,
        paymentMethod: (info.paymentMethod || null) as SalePaymentMethod | null,
        items: payloadItems,
      });
      setNotice(`Pedido de ${info.customerName || suggestion.customerName} criado (${money(order.totalCents)}).`);
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
      <div><strong>Prévias de pedidos</strong><small>{suggestions.length} aguardando confirmação</small></div>
      {notice && <span className="order-suggestions-notice">{notice}</span>}
    </header>
    {error && <p className="food-backup-error">{error}</p>}
    <div className="order-suggestions-list">
      {suggestions.map(suggestion => {
        const items = edits[suggestion.id] ?? suggestion.items;
        const info = details[suggestion.id] ?? {
          customerName: suggestion.customerName,
          paymentMethod: suggestion.paymentMethod ?? "",
          fulfillment: suggestion.fulfillment ?? "pickup",
          total: moneyInput(suggestion.totalCents),
        };
        const total = parseMoney(info.total);
        const open = expandedId === suggestion.id;
        return <article className={`order-suggestion${open ? " is-open" : ""}`} key={suggestion.id}>
          <button type="button" className="order-suggestion-summary" aria-expanded={open} onClick={() => setExpandedId(open ? null : suggestion.id)}>
            {suggestion.origin === "owner" ? <Store size={14} /> : <User size={14} />}
            <strong>{info.customerName || suggestion.customerName}</strong>
            <small>{suggestion.origin === "owner" ? "Anotação da loja" : "Cliente"} · {items.length} item(ns)</small>
            <span>{money(total)}</span>
            <ChevronDown size={15} />
          </button>
          {open && <div className="order-suggestion-body">
            <small className="order-suggestion-text">{suggestion.text.replace(/\n/g, " · ").slice(0, 220)}</small>
            <div className="order-suggestion-edit">
              <label>Cliente<input value={info.customerName} onChange={event => changeDetails(suggestion.id, { customerName: event.target.value })} /></label>
              <label>Pagamento<select value={info.paymentMethod} onChange={event => changeDetails(suggestion.id, { paymentMethod: event.target.value })}><option value="">Não informado</option>{paymentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Modalidade<select value={info.fulfillment} onChange={event => changeDetails(suggestion.id, { fulfillment: event.target.value as "pickup" | "delivery" })}><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>
              <label>Total (R$)<input inputMode="decimal" value={info.total} onChange={event => changeDetails(suggestion.id, { total: event.target.value })} /></label>
            </div>
            <div className="order-suggestion-items">
              {items.map(item => <div key={item.productId}>
                <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
                <input type="number" min="1" step="1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => changeQuantity(suggestion, item.productId, Number(event.target.value) || 0)} />
                <strong>{money(item.quantity * item.unitPriceCents)}</strong>
              </div>)}
            </div>
            <div className="proto-toolbar">
              <button type="button" onClick={() => void confirm(suggestion)} disabled={busyId === suggestion.id}>{busyId === suggestion.id ? "Criando…" : "Aprovar pedido"}</button>
              <button type="button" className="proto-subtle" onClick={() => dismiss(suggestion)} disabled={busyId === suggestion.id}><Trash2 size={14} /> Ignorar</button>
              <span role="status">{notice && busyId === null ? <><CheckCircle2 size={13} />{notice}</> : ""}</span>
            </div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
