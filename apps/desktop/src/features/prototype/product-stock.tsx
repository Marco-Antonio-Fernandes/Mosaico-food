import { useState, type FormEvent } from "react";
import { registerFoodStock, type FoodProduct } from "@/lib/food-api";

export function ProductStock({ product, onSaved }: { product: FoodProduct; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"receive_ready" | "receive_unprepared" | "prepare">(product.productionMode === "ready" || product.productionMode === "ingredient" ? "receive_ready" : product.productionMode === "made_here" || product.productionMode === "recipe" ? "prepare" : "receive_unprepared");
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
    <button type="button" className="proto-subtle" onClick={() => setOpen(!open)}>{product.productionMode === "made_here" || product.productionMode === "recipe" ? "Registrar produção" : "Registrar estoque"}</button>
    {open && <form className="proto-stack" onSubmit={event => void submit(event)}>
      <label>O que aconteceu?<select disabled={busy} value={action} onChange={event => { setAction(event.target.value as typeof action); setOperationId(crypto.randomUUID()); }}>
        {product.productionMode === "ingredient" && <option value="receive_ready">Adicionei insumos ao estoque</option>}
        {(product.productionMode === "frozen" || product.productionMode === "resale") && <option value="receive_unprepared">Adicionei unidades congeladas</option>}
        {product.productionMode === "ready" && <option value="receive_ready">Adicionei unidades já prontas</option>}
        {product.productionMode === "made_here" || product.productionMode === "recipe" ? <option value="prepare">Preparei unidades para vender</option> : null}
      </select></label>
      <label>Quantidade (unidades)<input required disabled={busy} type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setOperationId(crypto.randomUUID()); }} /></label>
      {action === "receive_unprepared" && <small>As unidades ficam congeladas e serão preparadas antes da venda.</small>}
      {action === "prepare" && <small>As unidades preparadas entram como prontas para venda.</small>}
      <button disabled={busy} type="submit">{busy ? "Registrando…" : "Registrar"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
