import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

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
  if (input.skipStock !== true) {
    const stock = await tx.foodProduct.updateMany({ where: { id: product.id, stockQuantity: { gte: input.quantity } }, data: { stockQuantity: { decrement: input.quantity } } });
    if (stock.count !== 1) throw new Error(`Estoque insuficiente de ${product.name}. Registre uma entrada antes de vender.`);
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
  return sale;
}
