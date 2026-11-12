import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { createFoodOrder, getFoodOrderSuggestions, getFoodProducts, registerCounterSale, resolveFoodOrderSuggestion, type FoodOrderSuggestion, type FoodOrderSuggestionItem, type FoodProduct, type SalePaymentMethod } from "@/lib/food-api";

const DISMISSED_KEY = "mosaico-dismissed-order-suggestions";
const paymentLabels: Record<string, string> = { pix: "Pix", cash: "Dinheiro", card_credit: "Crédito", card_debit: "Débito", meal_voucher: "Vale-alimentação", crediario: "Crediário", brinde: "Brinde" };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Draft = {
  customerName: string;
  fulfillment: "pickup" | "delivery" | "";
  paymentMethod: string;
  deliveryAddress: string;
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
    fulfillment: suggestion.fulfillment ?? "",
    paymentMethod: suggestion.paymentMethod ?? "",
    deliveryAddress: suggestion.deliveryAddress ?? "",
    items: suggestion.items.map(item => ({ ...item })),
  };
}

function missingFields(draft: Draft, intent: "sale" | "order") {
  const missing: string[] = [];
  if (!draft.paymentMethod) missing.push("pagamento");
  if (!draft.fulfillment) missing.push("modalidade");
  if (draft.fulfillment === "delivery" && !draft.deliveryAddress.trim()) missing.push("endereço");
  return missing;
}

export function FoodOrderSuggestions({ onPendingChange }: { onPendingChange?: (count: number) => void }) {
  const [suggestions, setSuggestions] = useState<FoodOrderSuggestion[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<FoodOrderSuggestion | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (current) setDraft(draftFrom(current));
    else setDraft(null);
  }, [current?.id]);

  useEffect(() => {
    if (!editing) return;
    void getFoodProducts({ activeOnly: true }).then(list => setProducts(list.filter(product => product.productionMode !== "ingredient"))).catch(() => setProducts([]));
  }, [editing?.id]);

  const remove = (suggestion: FoodOrderSuggestion) => {
    setSuggestions(currentList => {
      const next = currentList.filter(item => item.id !== suggestion.id);
      notify(next.length);
      return next;
    });
    setEditing(null);
    setEditDraft(null);
  };

  const dismiss = (suggestion: FoodOrderSuggestion) => {
    saveDismissed([...loadDismissed(), suggestion.id]);
    remove(suggestion);
  };

  const approve = async (suggestion: FoodOrderSuggestion, values?: Draft) => {
    if (busy) return;
    const source = values ?? draft ?? draftFrom(suggestion);
    if (!source.items.length) {
      setError("A prévia não tem itens. Edite ou ignore.");
      return;
    }
    if (suggestion.intent === "sale" && !source.paymentMethod) {
      setError("Informe o método de pagamento para registrar a venda.");
      setEditing(suggestion);
      setEditDraft(source);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (suggestion.intent === "sale") {
        await registerCounterSale({
          operationId: crypto.randomUUID(),
          paymentMethod: source.paymentMethod as SalePaymentMethod,
          items: source.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
        });
        setNotice("Venda registrada.");
      } else {
        await createFoodOrder({
          source: suggestion.origin === "owner" ? "balcao" : "whatsapp",
          customerName: source.customerName.trim() || null,
          fulfillment: source.fulfillment || "pickup",
          deliveryAddress: source.fulfillment === "delivery" ? source.deliveryAddress.trim() || null : null,
          paymentMethod: (source.paymentMethod || null) as SalePaymentMethod | null,
          items: source.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitPriceCents: item.unitPriceCents, variantName: item.variantName })),
        });
        setNotice("Pedido aprovado.");
      }
      saveDismissed([...loadDismissed(), suggestion.id]);
      await resolveFoodOrderSuggestion(suggestion.messageIds).catch(() => undefined);
      remove(suggestion);
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aprovar.");
    } finally {
      setBusy(false);
    }
  };

  const paymentOptions = (intent: "sale" | "order") => Object.entries(paymentLabels).filter(([value]) => intent !== "sale" || !["crediario", "brinde"].includes(value));

  const searchResults = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return products.slice(0, 8);
    return products.filter(product => `${product.productName || product.name} ${product.flavor ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 8);
  }, [products, productSearch]);

  const addProduct = (product: FoodProduct) => {
    if (!editDraft || !editing) return;
    const existing = editDraft.items.find(item => item.productId === product.id);
    if (existing) {
      setEditDraft({
        ...editDraft,
        items: editDraft.items.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1, totalCents: (item.quantity + 1) * item.unitPriceCents } : item),
      });
    } else {
      setEditDraft({
        ...editDraft,
        items: [...editDraft.items, {
          productId: product.id,
          name: product.productName || product.name,
          variantId: null,
          variantName: product.flavor,
          quantity: 1,
          unitPriceCents: product.salePriceCents,
          totalCents: product.salePriceCents,
        }],
      });
    }
    setProductSearch("");
  };

  if (!current) {
    return error ? <p className="food-backup-error">{error}</p> : null;
  }

  const activeDraft = draft ?? draftFrom(current);
  const missing = missingFields(activeDraft, current.intent);
  const itemsTotal = activeDraft.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  return <section className="order-preview-panel" aria-label="Prévia de pedido">
    <header>
      <div>
        <span className="order-preview-eyebrow">Prévia de {current.intent === "sale" ? "venda" : "pedido"}</span>
        <strong>{current.origin === "owner" ? "Anotação da loja" : "Mensagem do cliente"}</strong>
      </div>
      <span className="order-preview-count">{suggestions.length} pendente{suggestions.length === 1 ? "" : "s"}</span>
    </header>
    {error && <p className="food-backup-error">{error}</p>}
    {notice && <p className="order-preview-notice">{notice}</p>}
    <article className="order-preview-card">
      <div className="order-preview-meta"><span>Cliente</span><strong>{activeDraft.customerName || "Não identificado"}</strong></div>
      <blockquote className="order-preview-source">{current.text || "Mensagem sem texto identificado."}</blockquote>
      <div className="order-preview-items">
        {activeDraft.items.map(item => <div key={`${item.productId}:${item.variantId ?? ""}`}>
          <strong>{item.quantity}×</strong>
          <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
        </div>)}
      </div>
      <div className="order-preview-fields">
        <label>Modalidade<select value={activeDraft.fulfillment} onChange={event => setDraft({ ...activeDraft, fulfillment: event.target.value as "pickup" | "delivery" | "" })}><option value="">Não informado</option><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>
        <label>Pagamento<select value={activeDraft.paymentMethod} onChange={event => setDraft({ ...activeDraft, paymentMethod: event.target.value })}><option value="">Não informado</option>{paymentOptions(current.intent).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {activeDraft.fulfillment === "delivery" && <label className="order-preview-address">Endereço de entrega<input value={activeDraft.deliveryAddress} onChange={event => setDraft({ ...activeDraft, deliveryAddress: event.target.value })} placeholder="Informe o endereço" /></label>}
      </div>
      {missing.length > 0 && <p className="order-preview-missing">Faltando: {missing.join(", ")}</p>}
      <div className="order-preview-total">Total dos itens: <strong>{money(itemsTotal)}</strong></div>
      <div className="order-preview-actions">
        <button type="button" onClick={() => void approve(current, activeDraft)} disabled={busy}><Check size={15} />{busy ? "Aprovando…" : current.intent === "sale" ? "Registrar venda" : "Aprovar pedido"}</button>
        <button type="button" className="proto-subtle" onClick={() => { setEditing(current); setEditDraft(draftFrom(current)); setProductSearch(""); }} disabled={busy}><Pencil size={15} />Editar</button>
        <button type="button" className="proto-subtle" onClick={() => dismiss(current)} disabled={busy}><X size={15} />Ignorar</button>
      </div>
    </article>
    {editing && editDraft && <div className="order-preview-edit-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { setEditing(null); setEditDraft(null); } }}>
      <section className="proto-panel order-preview-edit" role="dialog" aria-modal="true" aria-labelledby="order-preview-edit-title">
        <header><div><span className="order-preview-eyebrow">Criar {editing.intent === "sale" ? "venda" : "pedido"} a partir da prévia</span><h3 id="order-preview-edit-title">Ajuste e complete as informações</h3></div><button type="button" className="proto-subtle" aria-label="Fechar edição" onClick={() => { setEditing(null); setEditDraft(null); }} disabled={busy}><X size={18} /></button></header>
        <div className="order-preview-edit-body">
          <div className="order-preview-edit-row">
            <label>Cliente<input value={editDraft.customerName} onChange={event => setEditDraft({ ...editDraft, customerName: event.target.value })} placeholder="Nome do cliente (opcional)" /></label>
            <label>Modalidade<select value={editDraft.fulfillment} onChange={event => setEditDraft({ ...editDraft, fulfillment: event.target.value as "pickup" | "delivery" | "" })}><option value="">Não informado</option><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>
          </div>
          <label>Pagamento<select value={editDraft.paymentMethod} onChange={event => setEditDraft({ ...editDraft, paymentMethod: event.target.value })}><option value="">{editing.intent === "sale" ? "Informe o pagamento" : "Não informado"}</option>{paymentOptions(editing.intent).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {editDraft.fulfillment === "delivery" && <label>Endereço de entrega<input value={editDraft.deliveryAddress} onChange={event => setEditDraft({ ...editDraft, deliveryAddress: event.target.value })} placeholder="Rua, número, bairro" /></label>}
          <div className="order-preview-edit-items">
            <strong>Itens do {editing.intent === "sale" ? "venda" : "pedido"}</strong>
            {editDraft.items.map(item => <div key={`${item.productId}:${item.variantId ?? ""}`}>
              <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</span>
              <input type="number" min="1" step="1" value={item.quantity} aria-label={`Quantidade de ${item.name}`} onChange={event => setEditDraft({ ...editDraft, items: editDraft.items.map(entry => entry.productId === item.productId ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry) })} />
              <strong>{money(item.quantity * item.unitPriceCents)}</strong>
              <button type="button" className="proto-subtle" aria-label={`Remover ${item.name}`} onClick={() => setEditDraft({ ...editDraft, items: editDraft.items.filter(entry => entry.productId !== item.productId) })}><Trash2 size={14} /></button>
            </div>)}
          </div>
          <div className="order-preview-add-product">
            <label><Search size={15} aria-hidden="true" /><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Adicionar produto…" /></label>
            <div className="order-preview-add-results">
              {searchResults.map(product => <button type="button" key={product.id} onClick={() => addProduct(product)} disabled={busy}><Plus size={14} />{product.productName || product.name}{product.flavor ? ` · ${product.flavor}` : ""}<span>{money(product.salePriceCents)}</span></button>)}
              {!searchResults.length && <small>Nenhum produto encontrado.</small>}
            </div>
          </div>
          <p className="order-preview-edit-total">Total: <strong>{money(editDraft.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0))}</strong></p>
          <blockquote className="order-preview-source">{editing.text}</blockquote>
          <div className="proto-toolbar"><button type="button" disabled={busy} onClick={() => void approve(editing, editDraft)}>{busy ? "Aprovando…" : editing.intent === "sale" ? "Registrar venda editada" : "Aprovar pedido editado"}</button><button type="button" className="proto-subtle" disabled={busy} onClick={() => { setEditing(null); setEditDraft(null); }}>Cancelar</button></div>
        </div>
      </section>
    </div>}
  </section>;
}
