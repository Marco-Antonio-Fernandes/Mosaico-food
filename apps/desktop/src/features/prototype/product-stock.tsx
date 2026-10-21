import { useState, type FormEvent } from "react";
import { registerFoodStock, type FoodProduct } from "@/lib/food-api";

export function ProductStock({ product, onSaved }: { product: FoodProduct; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"receive_ready" | "receive_unprepared" | "prepare">(product.productionMode === "recipe" ? "prepare" : "receive_ready");
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
    <button type="button" className="proto-subtle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Fechar movimentação" : "Registrar movimentação"}</button>
    {open && <form className="proto-stack" onSubmit={event => void submit(event)}>
      <label>O que aconteceu?<select disabled={busy} value={action} onChange={event => { setAction(event.target.value as typeof action); setOperationId(crypto.randomUUID()); }}>
        {product.productionMode !== "recipe" && <option value="receive_ready">{product.productionMode === "ingredient" ? "Recebi ingredientes" : "Recebi produtos prontos"}</option>}
        {product.productionMode !== "ingredient" && <option value="receive_unprepared">Recebi unidades para fritar / assar / finalizar</option>}
        {product.productionMode !== "ingredient" && <option value="prepare">Preparei unidades para vender</option>}
      </select></label>
      <label>Quantidade ({product.stockUnit})<input required disabled={busy} type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setOperationId(crypto.randomUUID()); }} /></label>
      {action === "prepare" && <small>O sistema descontará primeiro as unidades para finalizar e depois os ingredientes da receita. As unidades produzidas entrarão no estoque pronto.</small>}
      {product.stockUnit === "g" && <small>Informe em gramas: 1 kg = 1.000 g.</small>}
      {product.stockUnit === "ml" && <small>Informe em mililitros: 1 litro = 1.000 ml.</small>}
      <button disabled={busy} type="submit">{busy ? "Registrando…" : "Registrar"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
