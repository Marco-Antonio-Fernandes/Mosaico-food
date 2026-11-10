import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { recipeOf, salesProgressOf } from "./food-stock";

export type CounterSaleCustomization = {
  selectedQuantity?: number;
  removedQuantity?: number;
  addedItems?: string[];
};

type ProductCustomization = {
  label: string;
  unit: string;
  baseQuantity: number;
  additionalUnitPriceCents: number;
  allowRemoval: boolean;
};

function parseProductCustomization(value: string): ProductCustomization | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.label !== "string" || typeof row.unit !== "string" || typeof row.baseQuantity !== "number" || typeof row.additionalUnitPriceCents !== "number") return null;
    return {
      label: row.label,
      unit: row.unit,
      baseQuantity: row.baseQuantity,
      additionalUnitPriceCents: row.additionalUnitPriceCents,
      allowRemoval: row.allowRemoval !== false,
    };
  } catch {
    return null;
  }
}

async function createStockPrompts(tx: Prisma.TransactionClient, product: { id: string; name: string; recipeJson: string; salesProgressJson: string }, soldQuantity: number) {
  const recipe = recipeOf(product);
  if (!recipe.length || soldQuantity <= 0) return;

  const progress = salesProgressOf(product);
  const nextProgress = { ...progress };
  for (const row of recipe) {
    const total = (progress[row.ingredientId] ?? 0) + soldQuantity;
    const promptQuantity = Math.floor(total / row.quantity);
    nextProgress[row.ingredientId] = total % row.quantity;
    if (!promptQuantity) continue;

    const ingredient = await tx.foodProduct.findUnique({ where: { id: row.ingredientId } });
    const pending = await tx.foodStockPrompt.findFirst({ where: { productId: product.id, ingredientId: row.ingredientId, status: "pending" } });
    if (pending) {
      await tx.foodStockPrompt.update({ where: { id: pending.id }, data: { quantity: { increment: promptQuantity } } });
    } else {
      await tx.foodStockPrompt.create({ data: {
        id: randomUUID(),
        productId: product.id,
        productName: product.name,
        ingredientId: row.ingredientId,
        ingredientName: ingredient?.name ?? "insumo",
        quantity: promptQuantity,
        yieldQuantity: row.quantity,
      } });
    }
  }

  await tx.foodProduct.update({ where: { id: product.id }, data: { salesProgressJson: JSON.stringify(nextProgress) } });
}

async function ensureRecipeSaleCapacity(tx: Prisma.TransactionClient, product: { recipeJson: string; salesProgressJson: string }, quantity: number) {
  const recipe = recipeOf(product);
  if (!recipe.length) throw new Error("Sem estoque pronto para vender. Cadastre os insumos e o rendimento do produto.");
  const progress = salesProgressOf(product);
  for (const row of recipe) {
    const ingredient = await tx.foodProduct.findUnique({ where: { id: row.ingredientId } });
    const capacity = (ingredient?.stockQuantity ?? 0) * row.quantity - (progress[row.ingredientId] ?? 0);
    if (!ingredient || !ingredient.active || ingredient.productionMode !== "ingredient" || capacity < quantity) {
      throw new Error(`Insumo insuficiente para vender ${quantity} unidade${quantity === 1 ? "" : "s"}. Confira ${ingredient?.name ?? "a receita"}.`);
    }
  }
}

export async function recordCounterSale(tx: Prisma.TransactionClient, input: {
  operationId: string; source: string;
  id: string; productId: string; quantity: number; totalCents: number;
  unitPriceCents: number; paymentMethod: string | null;
  customization?: CounterSaleCustomization | null;
  adjustmentCents?: number;
  adjustmentNote?: string | null;
  isGift?: boolean;
  skipStock?: boolean;
}) {
  const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: input.productId } });
  if (!product.active || product.productionMode === "ingredient") throw new Error("Produto indisponível.");
  const customization = parseProductCustomization(product.customizationJson);
  const selectedQuantity = input.customization?.selectedQuantity ?? customization?.baseQuantity;
  if (customization && selectedQuantity !== undefined && (!Number.isInteger(selectedQuantity) || selectedQuantity < 0)) throw new Error(`A quantidade de ${customization.label} é inválida.`);
  if (customization && selectedQuantity !== undefined && !customization.allowRemoval && selectedQuantity < customization.baseQuantity) throw new Error(`Não é permitido remover ${customization.unit} de ${customization.label} neste produto.`);
  const additionalQuantity = customization && selectedQuantity !== undefined ? Math.max(0, selectedQuantity - customization.baseQuantity) : 0;
  const additionalCents = additionalQuantity * (customization?.additionalUnitPriceCents ?? 0);
  const adjustmentCents = input.adjustmentCents ?? 0;
  const expectedUnitPriceCents = input.isGift ? 0 : product.salePriceCents + additionalCents + adjustmentCents;
  if (expectedUnitPriceCents < 0) throw new Error("O preço final não pode ser negativo.");
  if (input.isGift && (input.unitPriceCents !== 0 || input.totalCents !== 0)) throw new Error("Um brinde precisa ter valor zero.");
  if (!input.isGift && expectedUnitPriceCents !== input.unitPriceCents) throw new Error("O preço mudou. Confira a venda novamente.");
  if ((adjustmentCents !== 0 || (input.customization?.removedQuantity ?? 0) > 0 || (input.customization?.addedItems?.length ?? 0) > 0) && !input.adjustmentNote?.trim()) throw new Error("Informe o motivo do adicional ou remoção.");
  const stockAlreadyReserved = input.skipStock === true;
  const fromReady = stockAlreadyReserved ? 0 : Math.min(input.quantity, product.stockQuantity);
  const fromIngredients = stockAlreadyReserved ? 0 : input.quantity - fromReady;
  if (fromReady) {
    const stock = await tx.foodProduct.updateMany({ where: { id: product.id, stockQuantity: { gte: fromReady } }, data: { stockQuantity: { decrement: fromReady } } });
    if (stock.count !== 1) throw new Error(`O estoque pronto de ${product.name} mudou. Confira a venda novamente.`);
  }
  if (fromIngredients) {
    if (product.productionMode !== "recipe") throw new Error(`Estoque insuficiente de ${product.name}. Registre o preparo antes de vender.`);
    await ensureRecipeSaleCapacity(tx, product, fromIngredients);
  }
  const sale = await tx.foodCounterSale.create({ data: {
    financialOperationId: input.operationId, source: input.source,
    id: input.id, productId: product.id, productName: product.name,
    quantity: input.quantity, totalCents: input.totalCents,
    baseUnitPriceCents: product.salePriceCents,
    customizationJson: JSON.stringify({
      ...input.customization,
      ...(customization ? {
        label: customization.label,
        unit: customization.unit,
        baseQuantity: customization.baseQuantity,
        selectedQuantity,
        additionalQuantity,
        additionalUnitPriceCents: customization.additionalUnitPriceCents,
      } : {}),
    }),
    adjustmentCents,
    adjustmentNote: input.adjustmentNote?.trim() || null,
    isGift: input.isGift ?? false,
    paymentMethod: input.paymentMethod, paymentStatus: input.paymentMethod && input.paymentMethod !== "crediario" ? "paid" : "pending",
  } });
  await createStockPrompts(tx, product, fromIngredients);
  return sale;
}
