import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { registerFoodStock, type FoodProduct } from "@/lib/food-api";

type StockAction = "receive_ready" | "loss";

export function ProductStock({ product, onSaved }: { product: FoodProduct; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<StockAction>("receive_ready");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await registerFoodStock(product.id, { operationId, action, quantity: Number(quantity) });
      setOperationId(crypto.randomUUID()); setQuantity(""); setOpen(false); setError("");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar."); }
    finally { setBusy(false); }
  }
  const unit = product.productionMode === "ingredient" ? product.stockUnit : "un";
  return <div className="proto-stack">
    <small>{product.stockQuantity} {unit} em estoque</small>
    <button type="button" className="proto-subtle" onClick={() => { setError(""); setOpen(true); }}>Registrar estoque</button>
    {open && <div className="food-action-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="food-action-modal food-stock-action-modal" role="dialog" aria-modal="true" aria-labelledby={`stock-action-title-${product.id}`}>
        <header className="food-action-modal-header"><div><span>Estoque</span><h2 id={`stock-action-title-${product.id}`}>Registrar estoque</h2><p>{product.productName || product.name}{product.flavor ? ` · ${product.flavor}` : ""}</p></div><button type="button" className="proto-subtle food-action-close" aria-label="Fechar" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button></header>
        <form className="food-action-form" onSubmit={event => void submit(event)}>
          <label>O que aconteceu?<select disabled={busy} value={action} onChange={event => { setAction(event.target.value as StockAction); setOperationId(crypto.randomUUID()); }}>
            <option value="receive_ready">Adicionei unidades ao estoque</option>
            <option value="loss">Dei baixa como perda</option>
          </select></label>
          <label>Quantidade ({unit})<input required disabled={busy} type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setOperationId(crypto.randomUUID()); }} /></label>
          {action === "loss" && <small>Essa quantidade será registrada como perda e entrará no cálculo de perdas do mês.</small>}
          {error && <p role="alert" className="proto-form-error">{error}</p>}
          <div className="proto-toolbar"><button disabled={busy} type="submit">{busy ? "Registrando…" : action === "loss" ? "Registrar perda" : "Registrar entrada"}</button><button type="button" className="proto-subtle" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button></div>
        </form>
      </section>
    </div>}
    {error && !open && <p role="alert">{error}</p>}
  </div>;
}
