import { useState, type FormEvent } from "react";
import type { FoodProduct, ProductInput } from "@/lib/food-api";

type IngredientUnit = "g" | "kg" | "ml" | "l" | "un";

type IngredientFormProps = {
  initial: FoodProduct | null;
  saving: boolean;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
};

const unitOptions: { value: IngredientUnit; label: string }[] = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "L" },
  { value: "ml", label: "ml" },
  { value: "un", label: "un." },
];

function decimalValue(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function measurementFromIngredient(ingredient: FoodProduct | null) {
  if (!ingredient) return { quantity: "", unit: "kg" as IngredientUnit };
  if (ingredient.stockUnit === "g") {
    const grams = ingredient.unitWeightGrams ?? 0;
    return grams >= 1000 && grams % 1000 === 0
      ? { quantity: String(grams / 1000), unit: "kg" as IngredientUnit }
      : { quantity: String(grams), unit: "g" as IngredientUnit };
  }
  if (ingredient.stockUnit === "ml") {
    const milliliters = ingredient.unitVolumeMl ?? 0;
    return milliliters >= 1000 && milliliters % 1000 === 0
      ? { quantity: String(milliliters / 1000), unit: "l" as IngredientUnit }
      : { quantity: String(milliliters), unit: "ml" as IngredientUnit };
  }
  return { quantity: "1", unit: "un" as IngredientUnit };
}

function baseMeasurement(quantity: number, unit: IngredientUnit) {
  if (unit === "kg") return { stockUnit: "g" as const, unitWeightGrams: Math.round(quantity * 1000), unitVolumeMl: null };
  if (unit === "g") return { stockUnit: "g" as const, unitWeightGrams: Math.round(quantity), unitVolumeMl: null };
  if (unit === "l") return { stockUnit: "ml" as const, unitWeightGrams: null, unitVolumeMl: Math.round(quantity * 1000) };
  if (unit === "ml") return { stockUnit: "ml" as const, unitWeightGrams: null, unitVolumeMl: Math.round(quantity) };
  return { stockUnit: "un" as const, unitWeightGrams: null, unitVolumeMl: null };
}

export function IngredientForm({ initial, saving, onSubmit, onCancel }: IngredientFormProps) {
  const measurement = measurementFromIngredient(initial);
  const [name, setName] = useState(initial?.productName || initial?.name || "");
  const [quantity, setQuantity] = useState(measurement.quantity);
  const [unit, setUnit] = useState<IngredientUnit>(measurement.unit);
  const [cost, setCost] = useState(initial && initial.costPriceCents > 0 ? (initial.costPriceCents / 100).toFixed(2).replace(".", ",") : "");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedQuantity = decimalValue(quantity);
    const parsedCost = decimalValue(cost);
    if (!name.trim()) {
      setError("Informe o nome do insumo.");
      return;
    }
    if (unit !== "un" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError("Informe o tamanho da embalagem.");
      return;
    }
    if (unit === "un" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setError("Informe um valor pago válido.");
      return;
    }
    const measurement = baseMeasurement(parsedQuantity, unit);
    onSubmit({
      productionMode: "ingredient",
      stockUnit: measurement.stockUnit,
      unitWeightGrams: measurement.unitWeightGrams,
      unitVolumeMl: measurement.unitVolumeMl,
      recipe: [],
      unpreparedQuantity: initial?.unpreparedQuantity ?? 0,
      name: name.trim(),
      productName: name.trim(),
      flavor: null,
      category: "Insumos",
      aliases: initial?.aliases ?? [],
      variants: initial?.variants ?? [],
      costPriceCents: Math.round(parsedCost * 100),
      costBreakdown: null,
      salePriceCents: 0,
      stockQuantity: initial?.stockQuantity ?? 0,
      allowOnDemand: false,
      fryToOrder: false,
      active: initial?.active ?? true,
    });
  };

  return <form className="proto-form ingredient-form" onSubmit={submit}>
      <p className="ingredient-form-help">Cadastre somente a embalagem e o valor pago. Este cadastro serve para calcular custos e não controla quantidade em estoque.</p>
      <div className="ingredient-form-grid">
        <label>Nome do insumo<input required autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Farinha de trigo" /></label>
        <label>Quantidade da embalagem<div className="cost-calculator-input-pair"><input required inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="5" /><select value={unit} onChange={event => setUnit(event.target.value as IngredientUnit)}>{unitOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></label>
        <label>Valor pago<div className="cost-calculator-currency"><span>R$</span><input required inputMode="decimal" value={cost} onChange={event => setCost(event.target.value)} placeholder="15,00" /></div></label>
      </div>
      {error && <p role="alert" className="proto-form-error">{error}</p>}
      <div className="proto-toolbar"><button type="submit" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Cadastrar insumo"}</button><button type="button" className="proto-subtle" onClick={onCancel} disabled={saving}>Cancelar</button></div>
  </form>;
}
