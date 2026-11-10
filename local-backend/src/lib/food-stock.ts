import type { Prisma, FoodProduct } from "@prisma/client";
import { z } from "zod";

const familySeparators = /\s+(?:de|da|do|das|dos|com)\s+/i;

export function productFamilyName(value: string | { name: string; productName?: string | null }) {
  const explicitName = typeof value === "string" ? "" : value.productName?.trim() ?? "";
  const name = explicitName || (typeof value === "string" ? value : value.name);
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const beforeSeparator = normalized.split(familySeparators)[0]?.trim();
  if (beforeSeparator && beforeSeparator !== normalized) return beforeSeparator;
  return normalized.split(" ")[0] ?? normalized;
}

export const recipeSchema = z.array(z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().int().positive().max(1000000),
})).max(40).refine(rows => new Set(rows.map(row => row.ingredientId)).size === rows.length, "Ingrediente repetido.");

export function recipeOf(product: { recipeJson: string }) {
  try { return recipeSchema.parse(JSON.parse(product.recipeJson)); } catch { return []; }
}

/**
 * For new recipes, quantity means how many finished products one unit of the
 * ingredient can yield. The progress keeps the fraction of the open unit
 * already used, so producing one item from a package that yields ten does not
 * remove the whole package immediately.
 */
export function recipeProgressOf(product: { recipeProgressJson?: string }) {
  try {
    const parsed: unknown = JSON.parse(product.recipeProgressJson ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([ingredientId, value]) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? [[ingredientId, value]] : []));
  } catch {
    return {};
  }
}

export function salesProgressOf(product: { salesProgressJson?: string }) {
  try {
    const parsed: unknown = JSON.parse(product.salesProgressJson ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([ingredientId, value]) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? [[ingredientId, value]] : []));
  } catch {
    return {};
  }
}

export type PreparationDependency = {
  ingredientId: string;
  name: string;
  stockQuantity: number;
  stockUnit: FoodProduct["stockUnit"];
  available: boolean;
};

export function preparationDependencies(product: FoodProduct, catalog: FoodProduct[]): PreparationDependency[] {
  if (product.productionMode !== "recipe") return [];
  return recipeOf(product).map(row => {
    const ingredient = catalog.find(item => item.id === row.ingredientId && item.active && item.productionMode === "ingredient");
    return {
      ingredientId: row.ingredientId,
      name: ingredient?.name ?? "Insumo não cadastrado",
      stockQuantity: ingredient?.stockQuantity ?? 0,
      stockUnit: ingredient?.stockUnit ?? "un",
      available: Boolean(ingredient && ingredient.stockQuantity > 0),
    };
  });
}

export function missingPreparationDependencies(product: FoodProduct, catalog: FoodProduct[]) {
  return preparationDependencies(product, catalog).filter(dependency => !dependency.available);
}

export function preparationCapacity(product: FoodProduct, catalog: FoodProduct[]): number {
  if (!product.active || product.productionMode === "ingredient") return 0;
  // Produtos feitos na loja não dependem de entrada ou insumo cadastrado.
  // Eles podem ser preparados na hora ou antecipadamente sem limite de produção.
  if (product.productionMode === "made_here") return 1_000_000_000;
  const recipe = recipeOf(product);
  const capacity = product.productionMode === "recipe" && recipe.length
    ? Math.min(...recipe.map(row => {
      const ingredient = catalog.find(item => item.id === row.ingredientId && item.active && item.productionMode === "ingredient");
      const progress = recipeProgressOf(product)[row.ingredientId] ?? 0;
      return Math.max(0, (ingredient?.stockQuantity ?? 0) * row.quantity - progress);
    })) : 0;
  return product.unpreparedQuantity + capacity;
}

export function salesCapacity(product: FoodProduct, catalog: FoodProduct[]): number {
  if (!product.active || product.productionMode !== "recipe") return product.stockQuantity;
  const recipe = recipeOf(product);
  if (!recipe.length) return product.stockQuantity;
  const progress = salesProgressOf(product);
  const ingredientCapacity = Math.min(...recipe.map(row => {
    const ingredient = catalog.find(item => item.id === row.ingredientId && item.active && item.productionMode === "ingredient");
    return Math.max(0, (ingredient?.stockQuantity ?? 0) * row.quantity - (progress[row.ingredientId] ?? 0));
  }));
  return product.stockQuantity + ingredientCapacity;
}

export type PreparationConsumption = {
  unpreparedQuantity: number;
  ingredientDeltas: Array<{ ingredientId: string; quantity: number }>;
  recipeProgressBeforeJson: string | null;
  recipeProgressAfterJson: string | null;
};

export async function consumePreparation(tx: Prisma.TransactionClient, productId: string, quantity: number): Promise<PreparationConsumption> {
  const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: productId } });
  if (!product.active || product.productionMode === "ingredient") throw new Error("Produto indisponível para preparo.");
  if (product.productionMode === "made_here") return { unpreparedQuantity: 0, ingredientDeltas: [], recipeProgressBeforeJson: null, recipeProgressAfterJson: null };
  const fromUnprepared = Math.min(quantity, product.unpreparedQuantity);
  if (fromUnprepared) {
    const result = await tx.foodProduct.updateMany({ where: { id: productId, unpreparedQuantity: { gte: fromUnprepared } }, data: { unpreparedQuantity: { decrement: fromUnprepared } } });
    if (result.count !== 1) throw new Error("O estoque para preparar mudou. Confira a quantidade.");
  }
  const remaining = quantity - fromUnprepared;
  if (!remaining) return { unpreparedQuantity: fromUnprepared, ingredientDeltas: [], recipeProgressBeforeJson: null, recipeProgressAfterJson: null };
  const recipe = recipeOf(product);
  if (product.productionMode !== "recipe" || !recipe.length) throw new Error("Sem unidades para preparar. Registre uma entrada de estoque.");
  const progress = recipeProgressOf(product);
  const nextProgress = { ...progress };
  const ingredientDeltas: Array<{ ingredientId: string; quantity: number }> = [];

  for (const row of recipe) {
    const ingredient = await tx.foodProduct.findUnique({ where: { id: row.ingredientId } });
    const alreadyUsed = Math.max(0, progress[row.ingredientId] ?? 0);
    const availableProducts = (ingredient?.stockQuantity ?? 0) * row.quantity - alreadyUsed;
    if (availableProducts < remaining) {
      throw new Error(`Estoque insuficiente de ${ingredient?.name ?? "ingrediente"}. A produção não foi registrada.`);
    }
    const totalUsed = alreadyUsed + remaining;
    const amount = Math.floor(totalUsed / row.quantity);
    nextProgress[row.ingredientId] = totalUsed % row.quantity;
    const result = await tx.foodProduct.updateMany({ where: { id: row.ingredientId, active: true, productionMode: "ingredient", stockQuantity: { gte: amount } }, data: { stockQuantity: { decrement: amount } } });
    if (result.count !== 1) {
      throw new Error(`Estoque insuficiente de ${ingredient?.name ?? "ingrediente"}. A produção não foi registrada.`);
    }
    if (amount > 0) ingredientDeltas.push({ ingredientId: row.ingredientId, quantity: amount });
  }

  const recipeProgressBeforeJson = product.recipeProgressJson;
  const recipeProgressAfterJson = JSON.stringify(nextProgress);
  await tx.foodProduct.update({ where: { id: productId }, data: { recipeProgressJson: recipeProgressAfterJson } });
  return { unpreparedQuantity: fromUnprepared, ingredientDeltas, recipeProgressBeforeJson, recipeProgressAfterJson };
}

export async function consumeLoss(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: productId } });
  if (!product.active || quantity <= 0) throw new Error("Produto indisponível para baixa.");

  const fromReady = Math.min(quantity, product.stockQuantity);
  if (fromReady) {
    const result = await tx.foodProduct.updateMany({ where: { id: productId, stockQuantity: { gte: fromReady } }, data: { stockQuantity: { decrement: fromReady } } });
    if (result.count !== 1) throw new Error("O estoque pronto mudou. Confira a quantidade.");
  }

  const remaining = quantity - fromReady;
  if (!remaining) return;
  const result = await tx.foodProduct.updateMany({ where: { id: productId, unpreparedQuantity: { gte: remaining } }, data: { unpreparedQuantity: { decrement: remaining } } });
  if (result.count !== 1) throw new Error(`Há apenas ${product.stockQuantity + product.unpreparedQuantity} unidade${product.stockQuantity + product.unpreparedQuantity === 1 ? "" : "s"} de ${product.name} para dar baixa.`);
}

export async function consumeReadyLoss(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: productId } });
  const result = await tx.foodProduct.updateMany({ where: { id: productId, stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } });
  if (result.count !== 1) throw new Error(`Há apenas ${product.stockQuantity} unidade${product.stockQuantity === 1 ? "" : "s"} prontas de ${product.name} para dar baixa.`);
}

export async function consumeUnpreparedLoss(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: productId } });
  const result = await tx.foodProduct.updateMany({ where: { id: productId, unpreparedQuantity: { gte: quantity } }, data: { unpreparedQuantity: { decrement: quantity } } });
  if (result.count !== 1) throw new Error(`Há apenas ${product.unpreparedQuantity} unidade${product.unpreparedQuantity === 1 ? "" : "s"} de ${product.name} para fritar/assar e dar baixa.`);
}
