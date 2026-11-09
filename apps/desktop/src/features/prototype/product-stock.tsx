import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { registerFoodStock, type FoodProduct } from "@/lib/food-api";

type StockAction = "receive_ready" | "receive_unprepared" | "prepare" | "loss" | "loss_ready" | "loss_unprepared";

export function ProductStock({ product, onSaved }: { product: FoodProduct; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<StockAction>(product.productionMode === "ready" || product.productionMode === "ingredient" ? "receive_ready" : product.productionMode === "made_here" || product.productionMode === "recipe" ? "prepare" : "receive_unprepared");
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
  return <div className="proto-stack">
    <small>{product.productionMode === "ingredient" ? `${product.stockQuantity} unidades disponíveis` : product.productionMode === "made_here" || product.productionMode === "recipe" ? `${product.stockQuantity} prontos · preparo livre` : `${product.stockQuantity} prontos · ${product.unpreparedQuantity} congelados`}</small>
    <button type="button" className="proto-subtle" onClick={() => { setError(""); setOpen(true); }}>{product.productionMode === "made_here" || product.productionMode === "recipe" ? "Registrar produção" : "Registrar estoque"}</button>
    {open && <div className="food-action-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="food-action-modal food-stock-action-modal" role="dialog" aria-modal="true" aria-labelledby={`stock-action-title-${product.id}`}>
        <header className="food-action-modal-header"><div><span>Assistente de estoque</span><h2 id={`stock-action-title-${product.id}`}>{product.productionMode === "made_here" || product.productionMode === "recipe" ? "Registrar produção" : "Registrar estoque"}</h2><p>{product.productName || product.name}{product.flavor ? ` · ${product.flavor}` : ""}</p></div><button type="button" className="proto-subtle food-action-close" aria-label="Fechar" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button></header>
        <form className="food-action-form" onSubmit={event => void submit(event)}>
          <label>O que aconteceu?<select disabled={busy} value={action} onChange={event => { setAction(event.target.value as typeof action); setOperationId(crypto.randomUUID()); }}>
            {product.productionMode === "ingredient" && <option value="receive_ready">Adicionei insumos ao estoque</option>}
            {(product.productionMode === "frozen" || product.productionMode === "resale") && <option value="receive_unprepared">Adicionei unidades congeladas</option>}
            {product.productionMode === "ready" && <option value="receive_ready">Adicionei unidades já prontas</option>}
            {product.productionMode === "made_here" || product.productionMode === "recipe" ? <option value="prepare">Preparei unidades para vender</option> : null}
            {product.productionMode === "ingredient" ? <option value="loss">Dei baixa de insumos perdidos</option> : <option value="loss_ready">Dei baixa de unidades prontas perdidas</option>}
            {(product.productionMode === "frozen" || product.productionMode === "resale") && <option value="loss_unprepared">Dei baixa de unidades congeladas perdidas</option>}
          </select></label>
          <label>Quantidade (unidades)<input required disabled={busy} type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setOperationId(crypto.randomUUID()); }} /></label>
          {action === "receive_unprepared" && <small>As unidades ficam congeladas e serão preparadas antes da venda.</small>}
          {action === "prepare" && <small>As unidades preparadas entram como prontas para venda.</small>}
          {(action === "loss" || action === "loss_ready" || action === "loss_unprepared") && <small>Essa quantidade será registrada como perda e entrará no cálculo de perdas do mês.</small>}
          {error && <p role="alert" className="proto-form-error">{error}</p>}
          <div className="proto-toolbar"><button disabled={busy} type="submit">{busy ? "Registrando…" : action === "loss" || action === "loss_ready" || action === "loss_unprepared" ? "Registrar perda" : "Registrar"}</button><button type="button" className="proto-subtle" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button></div>
        </form>
      </section>
    </div>}
    {error && !open && <p role="alert">{error}</p>}
  </div>;
}
