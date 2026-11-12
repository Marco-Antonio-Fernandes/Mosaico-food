import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { createFoodOrder, getFoodOrderSuggestions, type FoodOrderSuggestion, type FoodOrderSuggestionItem, type SalePaymentMethod } from "@/lib/food-api";

const DISMISSED_KEY = "mosaico-dismissed-order-suggestions";
const paymentLabels: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card_credit: "Crédito", card_debit: "Débito", meal_voucher: "Vale-alimentação", crediario: "Crediário", brinde: "Brinde" };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Draft = {
  customerName: string;
  fulfillment: "pickup" | "delivery";
  paymentMethod: string;
  items: FoodOrderSuggestionItem[];
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

function draftFrom(suggestion: FoodOrderSuggestion): Draft {
  return {
    customerName: suggestion.customerName || "",
    fulfillment: suggestion.fulfillment ?? "pickup",
    paymentMethod: suggestion.paymentMethod ?? "",
    items: suggestion.items.map(item => ({ ...item })),
  };
}

export function FoodOrderSuggestions({ onPendingChange }: { onPendingChange?: (count: number) => void }) {
  const [suggestions, setSuggestions] = useState<FoodOrderSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<FoodOrderSuggestion | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const current = suggestions[0] ?? null;

  const notify = (count: number) => onPendingChange?.(count);

  const load = async () => {
    try {
      const dismissed = new Set(loadDismissed());
      const next = (await getFoodOrderSuggestions()).filter(suggestion => !dismissed.has(suggestion.id));
      setSuggestions(next);
      notify(next.length);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar as prévias de pedidos.");
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const remove = (suggestion: FoodOrderSuggestion) => {
    setSuggestions(currentList => {
      const next = currentList.filter(item => item.id !== suggestion.id);
      notify(next.length);
      return next;
    });
    setEditing(null);
    setDraft(null);
  };

  const dismiss = (suggestion: FoodOrderSuggestion) => {
    saveDismissed([...loadDismissed(), suggestion.id]);
    remove(suggestion);
  };

  const approve = async (suggestion: FoodOrderSuggestion, values?: Draft) => {
    if (busy) return;
    const source = values ?? draftFrom(suggestion);
    if (!source.items.length) {
      setError("A prévia não tem itens. Edite ou ignore.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createFoodOrder({
        source: suggestion.origin === "owner" ? "balcao" : "whatsapp",
        customerName: source.customerName.trim() || null,
        fulfillment: source.fulfillment,
        paymentMethod: (source.paymentMethod || null) as SalePaymentMethod | null,
        items: source.items.map(item => ({
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
      setBusy(false);
    }
  };

  if (!current) {
    return error ? <p className="food-backup-error">{error}</p> : null;
  }

  const itemsTotal = current.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  return <section className="order-preview-panel" aria-label="Prévia de pedido">
    <header>
      <div>
        <span className="order-preview-eyebrow">Prévia de pedido</span>
        <strong>{current.origin === "owner" ? "Anotação da loja" : "Mensagem do cliente"}</strong>
      </div>
      <span className="order-preview-count">{suggestions.length} pendente{suggestions.length === 1 ? "" : "s"}</span>
    </header>
    {error && <p className="food-backup-error">{error}</p>}
    {notice && <p className="order-preview-notice">{notice}</p>}
    <article className="order-preview-card">
      <div className="order-preview-meta"><span>Cliente</span><strong>{current.customerName || "Não identificado"}</strong></div>
      <blockquote className="order-preview-source">{current.text || "Mensagem sem texto identificado."}</blockquote>
      <div className="order-preview-items">
        {current.items.map(item => <div key={`${item.productId}:${item.variantId ?? ""}`}>
          <strong>{item.quantity}×</strong>
          <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
        </div>)}
      </div>
      <div className="order-preview-total">Total dos itens: <strong>{money(itemsTotal)}</strong></div>
      <div className="order-preview-actions">
        <button type="button" onClick={() => void approve(current)} disabled={busy}><Check size={15} />{busy ? "Aprovando…" : "Aprovar"}</button>
        <button type="button" className="proto-subtle" onClick={() => { setEditing(current); setDraft(draftFrom(current)); }} disabled={busy}><Pencil size={15} />Editar</button>
        <button type="button" className="proto-subtle" onClick={() => dismiss(current)} disabled={busy}><X size={15} />Ignorar</button>
      </div>
    </article>
    {editing && draft && <div className="order-preview-edit-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { setEditing(null); setDraft(null); } }}>
      <section className="proto-panel order-preview-edit" role="dialog" aria-modal="true" aria-labelledby="order-preview-edit-title">
        <header><div><span className="order-preview-eyebrow">Editar prévia</span><h3 id="order-preview-edit-title">Ajuste o pedido antes de aprovar</h3></div><button type="button" className="proto-subtle" aria-label="Fechar edição" onClick={() => { setEditing(null); setDraft(null); }} disabled={busy}><X size={18} /></button></header>
        <div className="order-preview-edit-body">
          <label>Cliente<input value={draft.customerName} onChange={event => setDraft({ ...draft, customerName: event.target.value })} placeholder="Nome do cliente (opcional)" /></label>
          <div className="order-preview-edit-row">
            <label>Modalidade<select value={draft.fulfillment} onChange={event => setDraft({ ...draft, fulfillment: event.target.value as "pickup" | "delivery" })}><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>
            <label>Pagamento<select value={draft.paymentMethod} onChange={event => setDraft({ ...draft, paymentMethod: event.target.value })}><option value="">Não informado</option>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <div className="order-preview-edit-items">
            <strong>Itens</strong>
            {draft.items.map(item => <div key={`${item.productId}:${item.variantId ?? ""}`}>
              <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
              <input type="number" min="1" step="1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => setDraft({ ...draft, items: draft.items.map(entry => entry.productId === item.productId ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry) })} />
              <strong>{money(item.quantity * item.unitPriceCents)}</strong>
            </div>)}
          </div>
          <p className="order-preview-edit-total">Total: <strong>{money(draft.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0))}</strong></p>
          <blockquote className="order-preview-source">{editing.text}</blockquote>
          <div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void approve(editing, draft)}>{busy ? "Aprovando…" : "Aprovar pedido editado"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button></div>
        </div>
      </section>
    </div>}
  </section>;
}
