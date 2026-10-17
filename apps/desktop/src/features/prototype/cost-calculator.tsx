import { useEffect, useState, type FormEvent } from "react";
import { Calculator, Plus, Trash2, X } from "lucide-react";
import { createFoodProduct, getFoodProductLossSummary, getFoodProducts, updateFoodProduct, type FoodCostBreakdown, type FoodCostBreakdownItem, type FoodCostUnit, type FoodProduct, type FoodLossSummary } from "@/lib/food-api";

type CostCalculatorResult = {
  breakdown: FoodCostBreakdown;
  costPriceCents: number;
  suggestedSalePriceCents: number;
  salePriceCents: number;
};

type CostCalculatorProps = {
  initial: FoodCostBreakdown | null;
  productId?: string;
  productName?: string;
  onApply: (result: CostCalculatorResult) => void;
  onClose: () => void;
};

type CostCalculatorRow = {
  id: string;
  ingredientId?: string;
  name: string;
  packageQuantity: string;
  packageUnit: FoodCostUnit;
  packageCost: string;
  usedQuantity: string;
  usedUnit: FoodCostUnit;
};

const unitOptions: { value: FoodCostUnit; label: string; dimension: "mass" | "volume" | "count"; factor: number }[] = [
  { value: "g", label: "g", dimension: "mass", factor: 1 },
  { value: "kg", label: "kg", dimension: "mass", factor: 1000 },
  { value: "ml", label: "ml", dimension: "volume", factor: 1 },
  { value: "l", label: "L", dimension: "volume", factor: 1000 },
  { value: "un", label: "un.", dimension: "count", factor: 1 },
];

const targetFoodCostPercent = 30;
const operatingExpensePercent = 5;

function unitDefinition(unit: FoodCostUnit) {
  return unitOptions.find(option => option.value === unit) ?? unitOptions[0];
}

function normalizeIngredientName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function emptyRow(): CostCalculatorRow {
  return { id: crypto.randomUUID(), name: "", packageQuantity: "", packageUnit: "kg", packageCost: "", usedQuantity: "", usedUnit: "kg" };
}

function rowFromItem(item: FoodCostBreakdownItem): CostCalculatorRow {
  return {
    id: crypto.randomUUID(),
    ingredientId: item.ingredientId,
    name: item.name,
    packageQuantity: String(item.packageQuantity).replace(".", ","),
    packageUnit: item.packageUnit,
    packageCost: (item.packageCostCents / 100).toFixed(2).replace(".", ","),
    usedQuantity: String(item.usedQuantity).replace(".", ","),
    usedUnit: item.usedUnit,
  };
}

function ingredientMeasurement(ingredient: FoodProduct) {
  if (ingredient.stockUnit === "g") {
    const grams = ingredient.unitWeightGrams ?? 0;
    return grams >= 1000 && grams % 1000 === 0
      ? { packageQuantity: grams / 1000, packageUnit: "kg" as FoodCostUnit }
      : { packageQuantity: grams, packageUnit: "g" as FoodCostUnit };
  }
  if (ingredient.stockUnit === "ml") {
    const milliliters = ingredient.unitVolumeMl ?? 0;
    return milliliters >= 1000 && milliliters % 1000 === 0
      ? { packageQuantity: milliliters / 1000, packageUnit: "l" as FoodCostUnit }
      : { packageQuantity: milliliters, packageUnit: "ml" as FoodCostUnit };
  }
  return { packageQuantity: 1, packageUnit: "un" as FoodCostUnit };
}

function baseMeasurement(quantity: number, unit: FoodCostUnit) {
  if (unit === "kg") return { stockUnit: "g" as const, unitWeightGrams: Math.round(quantity * 1000), unitVolumeMl: null };
  if (unit === "g") return { stockUnit: "g" as const, unitWeightGrams: Math.round(quantity), unitVolumeMl: null };
  if (unit === "l") return { stockUnit: "ml" as const, unitWeightGrams: null, unitVolumeMl: Math.round(quantity * 1000) };
  if (unit === "ml") return { stockUnit: "ml" as const, unitWeightGrams: null, unitVolumeMl: Math.round(quantity) };
  return { stockUnit: "un" as const, unitWeightGrams: null, unitVolumeMl: null };
}

function decimalValue(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function currencyCents(value: string) {
  const parsed = decimalValue(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : NaN;
}

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function lineCostCents(row: CostCalculatorRow) {
  const packageQuantity = decimalValue(row.packageQuantity);
  const usedQuantity = decimalValue(row.usedQuantity);
  const packageCostCents = currencyCents(row.packageCost);
  const packageUnit = unitDefinition(row.packageUnit);
  const usedUnit = unitDefinition(row.usedUnit);
  if (!Number.isFinite(packageQuantity) || !Number.isFinite(usedQuantity) || !Number.isFinite(packageCostCents) || packageQuantity <= 0 || usedQuantity <= 0 || packageCostCents < 0 || packageUnit.dimension !== usedUnit.dimension) return null;
  return Math.round(packageCostCents * (usedQuantity * usedUnit.factor) / (packageQuantity * packageUnit.factor));
}

export function CostCalculator({ initial, productId, productName, onApply, onClose }: CostCalculatorProps) {
  const [yieldQuantity, setYieldQuantity] = useState(initial ? String(initial.yieldQuantity).replace(".", ",") : "");
  const [rows, setRows] = useState<CostCalculatorRow[]>(() => initial?.items.length ? initial.items.map(rowFromItem) : [emptyRow()]);
  const [salePriceOverride, setSalePriceOverride] = useState("");
  const [error, setError] = useState("");
  const [ingredients, setIngredients] = useState<FoodProduct[]>([]);
  const [lossSummary, setLossSummary] = useState<FoodLossSummary | null>(null);
  const [ingredientLoading, setIngredientLoading] = useState(true);
  const [lossLoading, setLossLoading] = useState(Boolean(productId));
  const [syncingIngredients, setSyncingIngredients] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFoodProducts({ activeOnly: true }).then(products => {
      if (cancelled) return;
      const loadedIngredients = products.filter(product => product.productionMode === "ingredient");
      setIngredients(loadedIngredients);
      setRows(current => current.map(row => {
        const ingredient = row.ingredientId
          ? loadedIngredients.find(item => item.id === row.ingredientId)
          : loadedIngredients.find(item => normalizeIngredientName(item.productName || item.name) === normalizeIngredientName(row.name));
        if (!ingredient) return row;
        const measurement = ingredientMeasurement(ingredient);
        return {
          ...row,
          ingredientId: ingredient.id,
          name: ingredient.productName || ingredient.name,
          packageQuantity: String(measurement.packageQuantity).replace(".", ","),
          packageUnit: measurement.packageUnit,
          packageCost: (ingredient.costPriceCents / 100).toFixed(2).replace(".", ","),
          usedUnit: unitDefinition(measurement.packageUnit).dimension === unitDefinition(row.usedUnit).dimension ? row.usedUnit : measurement.packageUnit,
        };
      }));
    }).catch(() => {
      // O preenchimento manual continua disponível mesmo se o cadastro não carregar.
    }).finally(() => {
      if (!cancelled) setIngredientLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!productId) {
      setLossLoading(false);
      setLossSummary(null);
      return;
    }
    let cancelled = false;
    setLossLoading(true);
    void getFoodProductLossSummary(productId).then(summary => {
      if (!cancelled) setLossSummary(summary);
    }).catch(() => {
      if (!cancelled) setLossSummary(null);
    }).finally(() => {
      if (!cancelled) setLossLoading(false);
    });
    return () => { cancelled = true; };
  }, [productId]);

  const updateRow = (id: string, changes: Partial<CostCalculatorRow>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row));
  };
  const previewYield = decimalValue(yieldQuantity);
  const previewTotalCostCents = rows.reduce((total, row) => total + (lineCostCents(row) ?? 0), 0);
  const previewBaseUnitCostCents = Number.isFinite(previewYield) && previewYield > 0 ? Math.round(previewTotalCostCents / previewYield) : null;
  const previewLossQuantity = lossSummary?.lossQuantity ?? 0;
  const previewLossRate = previewBaseUnitCostCents === null || !Number.isFinite(previewYield) || previewYield <= 0 ? 0 : previewLossQuantity / previewYield;
  const previewUnitCostCents = previewBaseUnitCostCents === null ? null : Math.round(previewBaseUnitCostCents * (1 + previewLossRate));
  const previewSuggestedSalePriceCents = previewUnitCostCents === null ? null : Math.ceil(previewUnitCostCents / (targetFoodCostPercent / 100));
  const previewSalePriceCents = previewSuggestedSalePriceCents === null ? null : salePriceOverride.trim() ? currencyCents(salePriceOverride) : previewSuggestedSalePriceCents;
  const previewGrossProfitCents = previewSalePriceCents === null || previewUnitCostCents === null || !Number.isFinite(previewSalePriceCents) ? null : previewSalePriceCents - previewUnitCostCents;
  const previewExpenseCents = previewGrossProfitCents === null ? null : Math.max(0, Math.round(previewGrossProfitCents * operatingExpensePercent / 100));
  const previewNetProfitCents = previewGrossProfitCents === null || previewExpenseCents === null ? null : previewGrossProfitCents - previewExpenseCents;
  const previewGrossMarginPercent = previewSalePriceCents && previewSalePriceCents > 0 && previewGrossProfitCents !== null ? previewGrossProfitCents / previewSalePriceCents * 100 : null;
  const previewNetMarginPercent = previewSalePriceCents && previewSalePriceCents > 0 && previewNetProfitCents !== null ? previewNetProfitCents / previewSalePriceCents * 100 : null;
  const previewTotalProfitCents = previewNetProfitCents === null || !Number.isFinite(previewYield) || previewYield <= 0 ? null : previewNetProfitCents * previewYield;

  const calculate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (syncingIngredients) return;
    const parsedYield = decimalValue(yieldQuantity);
    if (!Number.isInteger(parsedYield) || parsedYield <= 0) {
      setError("Informe um rendimento inteiro maior que zero.");
      return;
    }
    const validatedRows: { row: CostCalculatorRow; packageQuantity: number; usedQuantity: number; packageCostCents: number }[] = [];
    for (const [index, row] of rows.entries()) {
      const packageQuantity = decimalValue(row.packageQuantity);
      const usedQuantity = decimalValue(row.usedQuantity);
      const packageCostCents = currencyCents(row.packageCost);
      const packageUnit = unitDefinition(row.packageUnit);
      const usedUnit = unitDefinition(row.usedUnit);
      if (!row.name.trim() || !Number.isFinite(packageQuantity) || packageQuantity <= 0 || !Number.isFinite(usedQuantity) || usedQuantity <= 0 || !Number.isFinite(packageCostCents) || packageCostCents < 0) {
        setError(`Confira os dados do insumo ${index + 1}.`);
        return;
      }
      if (packageUnit.dimension !== usedUnit.dimension) {
        setError(`A unidade comprada e a unidade usada do insumo ${index + 1} precisam ser compatíveis.`);
        return;
      }
      validatedRows.push({ row, packageQuantity, usedQuantity, packageCostCents });
    }
    setSyncingIngredients(true);
    setError("");
    try {
      const items: FoodCostBreakdownItem[] = [];
      const syncedIngredients: FoodProduct[] = [];
      for (const { row, packageQuantity, usedQuantity, packageCostCents } of validatedRows) {
        const selectedIngredient = row.ingredientId
          ? ingredients.find(ingredient => ingredient.id === row.ingredientId)
          : ingredients.find(ingredient => normalizeIngredientName(ingredient.productName || ingredient.name) === normalizeIngredientName(row.name));
        const measurement = baseMeasurement(packageQuantity, row.packageUnit);
        const syncedIngredient = selectedIngredient
          ? await updateFoodProduct(selectedIngredient.id, {
            productionMode: "ingredient",
            stockUnit: measurement.stockUnit,
            unitWeightGrams: measurement.unitWeightGrams,
            unitVolumeMl: measurement.unitVolumeMl,
            name: row.name.trim(),
            productName: row.name.trim(),
            category: "Insumos",
            costPriceCents: packageCostCents,
            active: true,
          })
          : await createFoodProduct({
            productionMode: "ingredient",
            stockUnit: measurement.stockUnit,
            unitWeightGrams: measurement.unitWeightGrams,
            unitVolumeMl: measurement.unitVolumeMl,
            recipe: [],
            unpreparedQuantity: 0,
            name: row.name.trim(),
            productName: row.name.trim(),
            flavor: null,
            category: "Insumos",
            aliases: [],
            variants: [],
            costPriceCents: packageCostCents,
            costBreakdown: null,
            salePriceCents: 0,
            stockQuantity: 0,
            allowOnDemand: false,
            fryToOrder: false,
            active: true,
          });
        syncedIngredients.push(syncedIngredient);
        items.push({ ingredientId: syncedIngredient.id, name: row.name.trim(), packageQuantity, packageUnit: row.packageUnit, packageCostCents, usedQuantity, usedUnit: row.usedUnit });
      }
      setIngredients(current => {
        const next = [...current];
        for (const ingredient of syncedIngredients) {
          const index = next.findIndex(item => item.id === ingredient.id);
          if (index < 0) next.push(ingredient);
          else next[index] = ingredient;
        }
        return next;
      });
      const totalBatchCostCents = validatedRows.reduce((total, { row }) => total + (lineCostCents(row) ?? 0), 0);
      const baseCostPriceCents = Math.round(totalBatchCostCents / parsedYield);
      const lossRate = previewLossQuantity / parsedYield;
      const costPriceCents = Math.round(baseCostPriceCents * (1 + lossRate));
      const suggestedSalePriceCents = Math.ceil(costPriceCents / (targetFoodCostPercent / 100));
      const salePriceCents = salePriceOverride.trim() ? currencyCents(salePriceOverride) : suggestedSalePriceCents;
      if (!Number.isFinite(salePriceCents) || salePriceCents < 0) {
        setError("Informe um preço de venda válido para calcular a margem.");
        return;
      }
      onApply({ breakdown: { yieldQuantity: parsedYield, items }, costPriceCents, suggestedSalePriceCents, salePriceCents });
      window.dispatchEvent(new Event("food-stock-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar os insumos.");
    } finally {
      setSyncingIngredients(false);
    }
  };

  return <div className="cost-calculator-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="proto-panel cost-calculator-modal" role="dialog" aria-modal="true" aria-labelledby="cost-calculator-title">
      <header className="cost-calculator-header">
        <div><h3 id="cost-calculator-title"><Calculator size={18} /> Calcular custo por unidade</h3><p>Informe o que foi comprado, quanto foi usado e o rendimento desta receita.</p></div>
        <button type="button" className="proto-subtle cost-calculator-close" aria-label="Fechar calculadora" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="cost-calculator-example"><strong>Exemplo:</strong> 5 kg de farinha custam R$ 15,00; usando 1 kg para fazer 10 pães, a farinha custa R$ 0,30 por pão.</div>
      <form className="cost-calculator-form" onSubmit={calculate}>
        <label>Rendimento da receita (unidades)<input required type="text" inputMode="numeric" value={yieldQuantity} onChange={event => setYieldQuantity(event.target.value)} placeholder="Ex.: 10" /><small>Quantos produtos prontos esta quantidade de insumos gera.</small></label>
        <div className="cost-calculator-items">
          <div className="cost-calculator-section-heading"><div><strong>Insumos</strong><small>Você pode adicionar quantos ingredientes precisar.</small></div><button type="button" className="proto-subtle" onClick={() => setRows(current => [...current, emptyRow()])}><Plus size={15} />Adicionar insumo</button></div>
          {rows.map((row, index) => <article className="cost-calculator-item" key={row.id}>
            <div className="cost-calculator-item-heading"><strong>Insumo {index + 1}</strong>{rows.length > 1 && <button type="button" className="proto-subtle cost-calculator-remove" aria-label={`Remover insumo ${index + 1}`} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}><Trash2 size={15} /></button>}</div>
            <div className="cost-calculator-item-grid">
              <label className="cost-calculator-item-name">Produto ou insumo<input required list="cost-calculator-ingredients" value={row.name} onChange={event => { const value = event.target.value; const ingredient = ingredients.find(item => normalizeIngredientName(item.productName || item.name) === normalizeIngredientName(value)); if (!ingredient) { updateRow(row.id, { name: value, ingredientId: undefined }); return; } const measurement = ingredientMeasurement(ingredient); updateRow(row.id, { name: ingredient.productName || ingredient.name, ingredientId: ingredient.id, packageQuantity: String(measurement.packageQuantity).replace(".", ","), packageUnit: measurement.packageUnit, packageCost: (ingredient.costPriceCents / 100).toFixed(2).replace(".", ","), usedUnit: unitDefinition(measurement.packageUnit).dimension === unitDefinition(row.usedUnit).dimension ? row.usedUnit : measurement.packageUnit }); }} placeholder="Digite para buscar…" /></label>
              <label>Quantidade comprada<div className="cost-calculator-input-pair"><input required type="text" inputMode="decimal" value={row.packageQuantity} onChange={event => updateRow(row.id, { packageQuantity: event.target.value })} placeholder="5" /><select value={row.packageUnit} onChange={event => updateRow(row.id, { packageUnit: event.target.value as FoodCostUnit })}>{unitOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></label>
              <label>Valor pago<div className="cost-calculator-currency"><span>R$</span><input required inputMode="decimal" value={row.packageCost} onChange={event => updateRow(row.id, { packageCost: event.target.value })} placeholder="15,00" /></div></label>
              <label>Quantidade usada<div className="cost-calculator-input-pair"><input required type="text" inputMode="decimal" value={row.usedQuantity} onChange={event => updateRow(row.id, { usedQuantity: event.target.value })} placeholder="1" /><select value={row.usedUnit} onChange={event => updateRow(row.id, { usedUnit: event.target.value as FoodCostUnit })}>{unitOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></label>
            </div>
            {row.ingredientId && <small className="cost-calculator-ingredient-note">Insumo cadastrado. Ao confirmar, o valor e a embalagem editados aqui também serão atualizados no cadastro.</small>}
            {lineCostCents(row) !== null && <small className="cost-calculator-line-total">Custo usado nesta receita: {money(lineCostCents(row) ?? 0)}</small>}
          </article>)}
          <datalist id="cost-calculator-ingredients">{ingredients.map(ingredient => <option key={ingredient.id} value={ingredient.productName || ingredient.name} />)}</datalist>
        </div>
        {!ingredientLoading && !ingredients.length && <small className="cost-calculator-ingredient-note">Ainda não há insumos cadastrados. Ao confirmar um nome novo, ele será criado automaticamente para os próximos cálculos.</small>}
        {error && <p role="alert" className="proto-form-error">{error}</p>}
        <label className="cost-calculator-sale-price">Preço que quero vender (R$)<input inputMode="decimal" value={salePriceOverride || (previewSuggestedSalePriceCents === null ? "" : (previewSuggestedSalePriceCents / 100).toFixed(2).replace(".", ","))} onChange={event => setSalePriceOverride(event.target.value)} placeholder="Será sugerido" /><small>O preço sugerido usa food cost de {targetFoodCostPercent}%, mas você pode editar o valor. A margem será recalculada.</small></label>
        {previewUnitCostCents !== null && <div className="cost-calculator-summary"><span>Lucro bruto por unidade: <strong>{money(previewSalePriceCents ?? 0)}</strong><small>Preço de venda usado, antes dos custos</small></span><span>Parte que paga os insumos: <strong>{money(previewUnitCostCents)}</strong><small>{lossLoading ? "Consultando perdas…" : previewLossQuantity ? `${previewLossQuantity} perda${previewLossQuantity === 1 ? "" : "s"} neste mês incluída${previewLossQuantity === 1 ? "" : "s"}` : "Sem perdas registradas neste mês"}</small></span><span>Despesa operacional ({operatingExpensePercent}%): <strong>{money(previewExpenseCents ?? 0)}</strong><small>Percentual descontado do lucro bruto</small></span><span>Lucro para mim por unidade: <strong>{money(previewNetProfitCents ?? 0)}</strong><small>{previewNetMarginPercent === null ? "Margem líquida indisponível" : `Margem líquida de ${previewNetMarginPercent.toFixed(1).replace(".", ",")}%`}</small></span><span>Lucro para mim vendendo todas: <strong>{money(previewTotalProfitCents ?? 0)}</strong><small>{previewYield} unidades · custo da receita: {money(previewTotalCostCents)}</small></span></div>}
        <p className="cost-calculator-pricing-note">As perdas baixadas para {productName || "este produto"} neste mês aumentam proporcionalmente o custo por unidade. O preço informado recalcula a margem, a despesa de {operatingExpensePercent}% e o lucro líquido da receita.</p>
        <div className="cost-calculator-actions"><button type="submit" disabled={syncingIngredients}>{syncingIngredients ? "Salvando insumos…" : "Usar custo e preço informado"}</button><button type="button" className="proto-subtle" onClick={onClose} disabled={syncingIngredients}>Cancelar</button></div>
      </form>
    </section>
  </div>;
}
