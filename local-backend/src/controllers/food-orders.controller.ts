import { Controller, Get, Headers, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { refreshSalePaymentStatus, saleMovementWhere } from "../lib/sale-payments";
import { env } from "../lib/env";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";
import { WaAkgClient } from "../lib/wa-akg";
import { recordCounterSale } from "../lib/counter-sale";
import { consumePreparation } from "../lib/food-stock";
import { FinancialError, recordSaleReceipt, salePaymentSchema } from "../lib/financial-movement";

const statusSchema = z.object({ status: z.enum(["confirmed", "out_for_delivery", "delivered", "cancelled"]) });
const paymentSchema = z.object({ paymentMethod: salePaymentSchema, creditCustomerId: z.string().uuid().optional(), adjustmentCents: z.number().int().min(-1000000).max(1000000).default(0), adjustmentNote: z.string().trim().max(240).nullable().optional().default(null), cashReceivedCents: z.number().int().nonnegative().max(100000000).nullable().optional().default(null) });
const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().max(100000),
  unitPriceCents: z.number().int().nonnegative().max(1000000),
  variantName: z.string().trim().max(120).nullable().optional(),
  fryNow: z.boolean().default(false),
  readyQuantity: z.number().int().nonnegative().max(100000).optional(),
  prepareQuantity: z.number().int().nonnegative().max(100000).optional(),
  adjustmentCents: z.number().int().min(-1000000).max(1000000).default(0),
  adjustmentNote: z.string().trim().max(240).nullable().optional().default(null),
  isGift: z.boolean().default(false),
});
const createOrderSchema = z.object({
  source: z.string().trim().min(1).max(40).default("balcao"),
  customerName: z.string().trim().max(160).nullable().optional().default(null),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  deliveryAddress: z.string().trim().max(500).nullable().optional().default(null),
  paymentMethod: salePaymentSchema.nullable().optional().default(null),
  cashReceivedCents: z.number().int().nonnegative().max(100000000).nullable().optional().default(null),
  items: z.array(orderItemSchema).min(1).max(100),
});
const statusMessages: Record<string, string> = {
  confirmed: "foi recebido e confirmado",
  out_for_delivery: "está a caminho",
  delivered: "foi entregue",
  cancelled: "foi cancelado",
};

type StockReservation = {
  readyQuantity?: number;
  unpreparedQuantity?: number;
  ingredientDeltas?: Array<{ ingredientId?: string; quantity?: number }>;
  recipeProgressBeforeJson?: string | null;
};

function parseStockReservation(value: string | null): StockReservation | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const ingredientDeltas = Array.isArray(record.ingredientDeltas)
      ? record.ingredientDeltas.flatMap(entry => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const row = entry as Record<string, unknown>;
        return typeof row.ingredientId === "string" && typeof row.quantity === "number" && Number.isInteger(row.quantity) && row.quantity > 0
          ? [{ ingredientId: row.ingredientId, quantity: row.quantity }]
          : [];
      })
      : [];
    return {
      readyQuantity: typeof record.readyQuantity === "number" && Number.isInteger(record.readyQuantity) ? record.readyQuantity : undefined,
      unpreparedQuantity: typeof record.unpreparedQuantity === "number" && Number.isInteger(record.unpreparedQuantity) ? record.unpreparedQuantity : undefined,
      ingredientDeltas,
      recipeProgressBeforeJson: typeof record.recipeProgressBeforeJson === "string" ? record.recipeProgressBeforeJson : null,
    };
  } catch {
    return null;
  }
}

async function restoreReservedStock(
  transaction: Prisma.TransactionClient,
  order: { stockReserved: boolean; source: string; items: Array<{ productId: string | null; quantity: number; fryNow: boolean; stockReservationJson: string | null }> },
) {
  if (!order.stockReserved && order.source !== "whatsapp") return;

  const readyByProduct = new Map<string, number>();
  const unpreparedByProduct = new Map<string, number>();
  const ingredientsById = new Map<string, number>();
  const progressBeforeByProduct = new Map<string, string>();
  for (const item of order.items) {
    if (!item.productId) continue;
    const reservation = parseStockReservation(item.stockReservationJson);
    if (!reservation) {
      if (item.fryNow) unpreparedByProduct.set(item.productId, (unpreparedByProduct.get(item.productId) ?? 0) + item.quantity);
      else readyByProduct.set(item.productId, (readyByProduct.get(item.productId) ?? 0) + item.quantity);
      continue;
    }
    const readyQuantity = reservation.readyQuantity ?? 0;
    const unpreparedQuantity = reservation.unpreparedQuantity ?? 0;
    if (readyQuantity > 0) readyByProduct.set(item.productId, (readyByProduct.get(item.productId) ?? 0) + readyQuantity);
    if (unpreparedQuantity > 0) unpreparedByProduct.set(item.productId, (unpreparedByProduct.get(item.productId) ?? 0) + unpreparedQuantity);
    if (typeof reservation.recipeProgressBeforeJson === "string" && !progressBeforeByProduct.has(item.productId)) progressBeforeByProduct.set(item.productId, reservation.recipeProgressBeforeJson);
    for (const delta of reservation.ingredientDeltas ?? []) {
      if (delta.ingredientId && delta.quantity) ingredientsById.set(delta.ingredientId, (ingredientsById.get(delta.ingredientId) ?? 0) + delta.quantity);
    }
  }
  for (const [productId, quantity] of readyByProduct) await transaction.foodProduct.update({ where: { id: productId }, data: { stockQuantity: { increment: quantity } } });
  for (const [productId, quantity] of unpreparedByProduct) await transaction.foodProduct.update({ where: { id: productId }, data: { unpreparedQuantity: { increment: quantity } } });
  for (const [ingredientId, quantity] of ingredientsById) await transaction.foodProduct.update({ where: { id: ingredientId }, data: { stockQuantity: { increment: quantity } } });
  for (const [productId, recipeProgressJson] of progressBeforeByProduct) await transaction.foodProduct.update({ where: { id: productId }, data: { recipeProgressJson } });
}

@Controller("api/v1/food/orders")
export class FoodOrdersController {
  constructor(
    private readonly database: PrismaService,
    private readonly waAkg: WaAkgClient,
  ) {}

  @Post()
  async create(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_ORDER", "Confira os itens do pedido.", 400));

    try {
      const order = await this.database.$transaction(async transaction => {
        const productIds = [...new Set(parsed.data.items.map(item => item.productId))];
        const products = await transaction.foodProduct.findMany({ where: { id: { in: productIds } } });
        const byId = new Map(products.map(product => [product.id, product]));
        // A separação é automática: sempre baixa primeiro as unidades prontas
        // e só prepara a diferença. O cliente nunca escolhe a origem do item.
        const stockReserved = true;
        const items: Array<{
          productId: string;
          productName: string;
          variantName: string | null;
          quantity: number;
          unitPriceCents: number;
          totalCents: number;
          fryNow: boolean;
          stockReservationJson: string | null;
          adjustmentCents: number;
          adjustmentNote: string | null;
          isGift: boolean;
        }> = [];
        for (const item of parsed.data.items) {
          const product = byId.get(item.productId);
          if (!product || !product.active || product.productionMode === "ingredient") throw new Error("PRODUCT_UNAVAILABLE");
          const expectedUnitPrice = item.isGift ? 0 : product.salePriceCents + item.adjustmentCents;
          if (expectedUnitPrice < 0 || expectedUnitPrice !== item.unitPriceCents) throw new Error("ORDER_PRICE_CHANGED");
          if ((item.adjustmentCents !== 0 || item.isGift) && !item.adjustmentNote?.trim()) throw new Error("ORDER_ADJUSTMENT_NOTE_REQUIRED");
          const readyQuantity = Math.min(product.stockQuantity, item.quantity);
          const prepareQuantity = item.quantity - readyQuantity;
          let preparationConsumption: Awaited<ReturnType<typeof consumePreparation>> = { unpreparedQuantity: 0, ingredientDeltas: [], recipeProgressBeforeJson: null, recipeProgressAfterJson: null };
          if (readyQuantity > 0) {
            const result = await transaction.foodProduct.updateMany({ where: { id: product.id, active: true, stockQuantity: { gte: readyQuantity } }, data: { stockQuantity: { decrement: readyQuantity } } });
            if (result.count !== 1) throw new Error("ORDER_READY_STOCK_INSUFFICIENT");
            product.stockQuantity -= readyQuantity;
          }
          if (prepareQuantity > 0) preparationConsumption = await consumePreparation(transaction, product.id, prepareQuantity);
          const common = {
            productId: product.id,
            productName: product.name,
            variantName: item.variantName ?? null,
            unitPriceCents: item.unitPriceCents,
            adjustmentCents: item.adjustmentCents,
            adjustmentNote: item.adjustmentNote?.trim() || null,
            isGift: item.isGift,
          };
          if (readyQuantity > 0) items.push({ ...common, quantity: readyQuantity, totalCents: readyQuantity * item.unitPriceCents, fryNow: false, stockReservationJson: JSON.stringify({ readyQuantity }) });
          if (prepareQuantity > 0) items.push({ ...common, quantity: prepareQuantity, totalCents: prepareQuantity * item.unitPriceCents, fryNow: true, stockReservationJson: JSON.stringify(preparationConsumption) });
        }
        const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
        const cashReceivedCents = parsed.data.paymentMethod === "cash"
          ? parsed.data.cashReceivedCents ?? totalCents
          : null;
        if (parsed.data.paymentMethod === "cash" && cashReceivedCents !== null && cashReceivedCents < totalCents) throw new Error("CASH_RECEIVED_BELOW_TOTAL");
        return transaction.foodOrder.create({
          data: {
            status: "confirmed",
            customerName: parsed.data.customerName,
            fulfillment: parsed.data.fulfillment,
            deliveryAddress: parsed.data.deliveryAddress,
            totalCents,
            cashReceivedCents,
            cashChangeCents: cashReceivedCents === null ? null : cashReceivedCents - totalCents,
            source: parsed.data.source,
            paymentMethod: parsed.data.paymentMethod,
            stockReserved,
            items: { create: items },
          },
          include: { customer: true, items: true },
        });
      });
      return response.status(201).json(jsonData({ order }));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, [number, string, string]> = {
        PRODUCT_UNAVAILABLE: [409, "PRODUCT_UNAVAILABLE", "Um dos produtos não está disponível."],
        ORDER_PRICE_CHANGED: [409, "ORDER_PRICE_CHANGED", "O preço de um produto mudou. Confira o pedido novamente."],
        ORDER_ADJUSTMENT_NOTE_REQUIRED: [400, "ORDER_ADJUSTMENT_NOTE_REQUIRED", "Informe o motivo do ajuste ou do brinde."],
        ORDER_READY_STOCK_INSUFFICIENT: [409, "ORDER_READY_STOCK_INSUFFICIENT", "O estoque pronto mudou. Confira o pedido novamente."],
        CASH_RECEIVED_BELOW_TOTAL: [400, "CASH_RECEIVED_BELOW_TOTAL", "O dinheiro entregue precisa ser igual ou maior que o total do pedido."],
      };
      const result = messages[code];
      if (result) return response.status(result[0]).json(jsonError(result[1], result[2], result[0]));
      throw error;
    }
  }

  private async notifyStatus(order: {
    id: string;
    customerName: string | null;
    status: string;
    fulfillment: string;
    conversation: { id: string; remoteJid: string } | null;
  }) {
    if (!order.conversation || !this.waAkg.isConfigured) {
      return { sent: false, skipped: true };
    }

    const statusMessage = statusMessages[order.status] ?? "teve o status atualizado";
    const body = `Atualização do pedido${order.customerName ? ` de ${order.customerName}` : ""}: ${statusMessage}.`;
    try {
      const sent = await this.waAkg.sendText(order.conversation.remoteJid, body);
      await this.database.foodMessage.create({
        data: {
          conversationId: order.conversation.id,
          sessionId: this.waAkg.sessionId ?? env.WA_AKG_SESSION_ID ?? "",
          providerMessageId: sent.providerMessageId ?? `outbound:status:${randomUUID()}`,
          direction: "outbound",
          source: "system",
          body,
          processedAt: new Date(),
        },
      });
      await this.database.foodConversation.update({
        where: { id: order.conversation.id },
        data: { lastMessageAt: new Date() },
      });
      return { sent: true, skipped: false };
    } catch {
      return { sent: false, skipped: false };
    }
  }

  @Patch(":id/payment")
  async updatePayment(@Req() request: Request, @Param("id") id: string, @Headers("idempotency-key") operationId: string | undefined, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma forma de pagamento válida.", 400));
    if (parsed.data.paymentMethod === "crediario" && (!operationId || !z.string().uuid().safeParse(operationId).success)) return response.status(400).json(jsonError("IDEMPOTENCY_KEY_REQUIRED", "Envie um Idempotency-Key UUID.", 400));
    try {
      const order = await this.database.$transaction(async transaction => {
        const current = await transaction.foodOrder.findUnique({ where: { id }, include: { customer: true } });
        if (!current) throw new Error("ORDER_NOT_FOUND");
        if (current.status === "cancelled") throw new FinancialError("Um pedido cancelado não pode receber pagamento.");
        if (await transaction.foodFinancialMovement.findFirst({ where: { saleType: "order", saleId: current.id } })) throw new FinancialError("Use Pagamentos no financeiro para complementar ou estornar este pedido.");
        const receipt = await transaction.foodFinancialMovement.findUnique({ where: { referenceType_referenceId_kind: { referenceType: "order", referenceId: current.id, kind: "receipt" } } });
        if (current.paymentStatus === "paid" && !receipt) throw new FinancialError("Este pagamento é anterior ao novo controle financeiro. Confira o histórico antes de alterá-lo.");
        const existingCharge = await transaction.creditEntry.findFirst({ where: { referenceType: "food_order", referenceId: current.id, type: "charge" } });
        if (existingCharge && parsed.data.paymentMethod !== "crediario") throw new FinancialError("Receba este pagamento pela conta de crediário do cliente.");
        const cashReceivedCents = parsed.data.paymentMethod === "cash"
          ? parsed.data.cashReceivedCents ?? (current.paymentMethod === "cash" ? current.cashReceivedCents ?? current.totalCents : current.totalCents)
          : null;
        if (parsed.data.paymentMethod === "cash" && cashReceivedCents !== null && cashReceivedCents < current.totalCents) throw new Error("CASH_RECEIVED_BELOW_TOTAL");
        await recordSaleReceipt(transaction, { referenceType: "order", referenceId: current.id, source: current.source, totalCents: current.totalCents, paymentMethod: parsed.data.paymentMethod });
        if (parsed.data.paymentMethod === "crediario") {
          const explicit = parsed.data.creditCustomerId;
          let creditCustomerId = explicit ?? current.customer?.creditCustomerId ?? undefined;
          if (!creditCustomerId && current.customer) {
            const canonical = (value: string) => {
              const digits = value.replace(/\D/g, "");
              return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
            };
            const allCustomers = await transaction.customer.findMany({ where: { normalizedPhone: { not: null } }, select: { id: true, normalizedPhone: true } });
            const matches = allCustomers.filter(customer => customer.normalizedPhone && canonical(customer.normalizedPhone) === canonical(current.customer!.normalizedPhone));
            if (matches.length === 1) creditCustomerId = matches[0].id;
            else throw new Error(matches.length ? "CREDIT_CUSTOMER_AMBIGUOUS" : "CREDIT_CUSTOMER_LINK_REQUIRED");
          }
          if (!creditCustomerId) throw new Error("CREDIT_CUSTOMER_LINK_REQUIRED");
          const account = await transaction.creditAccount.findUnique({ where: { customerId: creditCustomerId } });
          if (!account) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
          const previous = await transaction.creditEntry.findUnique({ where: { operationId: operationId! } });
          if (previous && (previous.referenceType !== "food_order" || previous.referenceId !== current.id)) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
          const orderCharge = existingCharge;
          if (orderCharge && (orderCharge.creditAccountId !== account.id || orderCharge.amountCents !== current.totalCents)) throw new Error("ORDER_ALREADY_CREDITED");
          if (orderCharge) return current;
          if (!previous) {
            if (account.creditLimitCents !== null && account.balanceCents + current.totalCents > account.creditLimitCents) throw new Error("CREDIT_LIMIT_EXCEEDED");
            await transaction.creditEntry.create({ data: { creditAccountId: account.id, type: "charge", amountCents: current.totalCents, note: `Pedido Food ${current.id}`, occurredAt: new Date(), operationId: operationId!, referenceType: "food_order", referenceId: current.id } });
            await transaction.creditAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: current.totalCents }, version: { increment: 1 } } });
          }
          if (current.customer && current.customer.creditCustomerId !== creditCustomerId) await transaction.foodCustomer.update({ where: { id: current.customer.id }, data: { creditCustomerId } });
          return transaction.foodOrder.update({ where: { id }, data: { paymentMethod: "crediario", paymentStatus: "pending", cashReceivedCents: null, cashChangeCents: null } });
        }
        return transaction.foodOrder.update({ where: { id }, data: { paymentMethod: parsed.data.paymentMethod, paymentStatus: "paid", cashReceivedCents, cashChangeCents: cashReceivedCents === null ? null : cashReceivedCents - current.totalCents } });
      });
      return response.json(jsonData({ order }));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("PAYMENT_CONFLICT", error.message, 409));
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, [number, string, string]> = {
        ORDER_NOT_FOUND: [404, "NOT_FOUND", "Pedido não encontrado."], CREDIT_ACCOUNT_NOT_FOUND: [404, "CREDIT_ACCOUNT_NOT_FOUND", "O cliente não possui conta de crediário."],
        CREDIT_CUSTOMER_LINK_REQUIRED: [409, "CREDIT_CUSTOMER_LINK_REQUIRED", "Vincule o cliente do pedido a uma conta de crédito antes de lançar no crediário."], CREDIT_CUSTOMER_AMBIGUOUS: [409, "CREDIT_CUSTOMER_AMBIGUOUS", "Há mais de uma conta com esse telefone; escolha o cliente explicitamente."], CREDIT_LIMIT_EXCEEDED: [409, "CREDIT_LIMIT_EXCEEDED", "O limite de crédito seria ultrapassado."],
        IDEMPOTENCY_KEY_CONFLICT: [409, "IDEMPOTENCY_KEY_CONFLICT", "Esta chave de idempotência já foi usada em outro lançamento."], ORDER_ALREADY_CREDITED: [409, "ORDER_ALREADY_CREDITED", "Este pedido já foi lançado no crediário."],
        CASH_RECEIVED_BELOW_TOTAL: [400, "CASH_RECEIVED_BELOW_TOTAL", "O dinheiro entregue precisa ser igual ou maior que o total do pedido."],
      };
      const result = messages[code];
      if (result) return response.status(result[0]).json(jsonError(result[1], result[2], result[0]));
      throw error;
    }
  }

  @Get()
  async list(
    @Req() request: Request,
    @Query("status") status: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const orders = await this.database.foodOrder.findMany({
      where: status === "active" ? { status: { in: ["confirmed", "preparing", "ready", "out_for_delivery"] } } : status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    return response.json(jsonData({ orders }));
  }

  @Post(":id/finalize")
  async finalize(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma forma de pagamento válida.", 400));

    try {
      const order = await this.database.$transaction(async transaction => {
        const current = await transaction.foodOrder.findUnique({ where: { id }, include: { items: true } });
        if (!current) throw new Error("ORDER_NOT_FOUND");
        if (current.saleOperationId) return transaction.foodOrder.findUniqueOrThrow({ where: { id }, include: { customer: true, conversation: true, items: true } });
        if (current.status === "cancelled") throw new FinancialError("Um pedido cancelado não pode ser finalizado.");

        const finalAdjustmentCents = parsed.data.adjustmentCents;
        if (finalAdjustmentCents !== 0 && !parsed.data.adjustmentNote?.trim()) throw new Error("ORDER_ADJUSTMENT_NOTE_REQUIRED");
        if (finalAdjustmentCents !== 0 && (!current.items.length || current.items[0].isGift || current.items[0].unitPriceCents + finalAdjustmentCents < 0)) throw new Error("ORDER_ADJUSTMENT_INVALID");
        if (finalAdjustmentCents !== 0) {
          const first = current.items[0];
          const adjustedUnitPriceCents = first.unitPriceCents + finalAdjustmentCents;
          const combinedNote = [first.adjustmentNote, parsed.data.adjustmentNote?.trim()].filter(Boolean).join("; ") || null;
          if (first.quantity > 1) {
            await transaction.foodOrderItem.update({ where: { id: first.id }, data: { quantity: first.quantity - 1, totalCents: (first.quantity - 1) * first.unitPriceCents } });
            await transaction.foodOrderItem.create({ data: { orderId: current.id, productId: first.productId, productName: first.productName, variantName: first.variantName, quantity: 1, unitPriceCents: adjustedUnitPriceCents, totalCents: adjustedUnitPriceCents, fryNow: first.fryNow, adjustmentCents: first.adjustmentCents + finalAdjustmentCents, adjustmentNote: combinedNote, isGift: false } });
          } else {
            await transaction.foodOrderItem.update({ where: { id: first.id }, data: { unitPriceCents: adjustedUnitPriceCents, totalCents: adjustedUnitPriceCents, adjustmentCents: first.adjustmentCents + finalAdjustmentCents, adjustmentNote: combinedNote } });
          }
        }
        const finalItems = await transaction.foodOrderItem.findMany({ where: { orderId: current.id } });
        const finalTotalCents = current.totalCents + finalAdjustmentCents;
        if (finalTotalCents < 0) throw new Error("ORDER_ADJUSTMENT_INVALID");
        const cashReceivedCents = parsed.data.paymentMethod === "cash"
          ? parsed.data.cashReceivedCents ?? (current.paymentMethod === "cash" ? current.cashReceivedCents ?? finalTotalCents : finalTotalCents)
          : null;
        if (parsed.data.paymentMethod === "cash" && cashReceivedCents !== null && cashReceivedCents < finalTotalCents) throw new Error("CASH_RECEIVED_BELOW_TOTAL");

        let creditAccount: { id: string; balanceCents: number; creditLimitCents: number | null } | null = null;
        const orderCharge = await transaction.creditEntry.findFirst({ where: { referenceType: "food_order", referenceId: current.id, type: "charge" } });
        if (orderCharge && parsed.data.paymentMethod !== "crediario") throw new FinancialError("Receba este pagamento pela conta de crediário do cliente.");
        if (parsed.data.paymentMethod === "crediario") {
          if (!parsed.data.creditCustomerId) throw new Error("CREDIT_CUSTOMER_REQUIRED");
          creditAccount = await transaction.creditAccount.findUnique({ where: { customerId: parsed.data.creditCustomerId }, select: { id: true, balanceCents: true, creditLimitCents: true } });
          if (!creditAccount) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
          if (orderCharge && (orderCharge.creditAccountId !== creditAccount.id || orderCharge.amountCents !== finalTotalCents)) throw new FinancialError("Confira a cobrança já registrada no crediário antes de alterar o pedido.");
          if (!orderCharge && creditAccount.creditLimitCents !== null && creditAccount.balanceCents + finalTotalCents > creditAccount.creditLimitCents) throw new Error("CREDIT_LIMIT_EXCEEDED");
        }

        for (const item of finalItems) {
          if (!item.productId) throw new Error("ORDER_PRODUCT_MISSING");
          const stockAlreadyReserved = current.stockReserved || current.source === "whatsapp";
          if (item.fryNow && !stockAlreadyReserved) await consumePreparation(transaction, item.productId, item.quantity);
          await recordCounterSale(transaction, {
            id: randomUUID(),
            operationId: current.id,
            source: current.source,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            paymentMethod: parsed.data.paymentMethod,
            adjustmentCents: item.adjustmentCents,
            adjustmentNote: item.adjustmentNote,
            isGift: item.isGift,
            skipStock: stockAlreadyReserved || item.fryNow,
          });
        }
        const hasInstallments = Boolean(await transaction.foodFinancialMovement.findFirst({ where: { saleType: "order", saleId: current.id } }));
        if (hasInstallments && parsed.data.paymentMethod === "crediario") throw new FinancialError("Não é possível converter um pedido com parcelas em crediário.");
        const existingReceipt = await transaction.foodFinancialMovement.findUnique({ where: { referenceType_referenceId_kind: { referenceType: "order", referenceId: current.id, kind: "receipt" } } });
        if (current.paymentStatus === "paid" && !existingReceipt && !hasInstallments) {
          if (current.totalCents !== finalTotalCents || current.paymentMethod !== parsed.data.paymentMethod) throw new FinancialError("Confira o pagamento antigo antes de alterar o pedido.");
        } else {
          await recordSaleReceipt(transaction, { referenceType: "order", referenceId: current.id, source: current.source, totalCents: finalTotalCents, paymentMethod: parsed.data.paymentMethod });
        }
        if (creditAccount && !orderCharge) {
          await transaction.creditEntry.create({ data: { creditAccountId: creditAccount.id, type: "charge", amountCents: finalTotalCents, note: `Pedido Food ${current.id}`, occurredAt: new Date(), operationId: current.id, referenceType: "food_order", referenceId: current.id } });
          await transaction.creditAccount.update({ where: { id: creditAccount.id }, data: { balanceCents: { increment: finalTotalCents }, version: { increment: 1 } } });
        }
        await transaction.foodCounterBatch.create({ data: { id: current.id, fingerprint: `order:${current.id}` } });
        await transaction.foodOrder.update({
          where: { id },
          data: { status: "delivered", totalCents: finalTotalCents, paymentMethod: parsed.data.paymentMethod, paymentStatus: parsed.data.paymentMethod === "crediario" ? "pending" : "paid", cashReceivedCents, cashChangeCents: cashReceivedCents === null ? null : cashReceivedCents - finalTotalCents, saleOperationId: current.id },
          include: { customer: true, conversation: true, items: true },
        });
        if (hasInstallments) await refreshSalePaymentStatus(transaction, "order", id);
        return transaction.foodOrder.findUniqueOrThrow({ where: { id }, include: { customer: true, conversation: true, items: true } });
      });
      const notification = await this.notifyStatus(order);
      return response.json(jsonData({ order, notification }));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, [number, string, string]> = {
        ORDER_NOT_FOUND: [404, "NOT_FOUND", "Pedido não encontrado."],
        ORDER_PRODUCT_MISSING: [409, "ORDER_PRODUCT_MISSING", "O pedido possui um item sem produto vinculado."],
        CREDIT_CUSTOMER_REQUIRED: [400, "CREDIT_CUSTOMER_REQUIRED", "Selecione o cliente do crediário."],
        CREDIT_ACCOUNT_NOT_FOUND: [404, "CREDIT_ACCOUNT_NOT_FOUND", "O cliente não possui conta de crediário."],
        CREDIT_LIMIT_EXCEEDED: [409, "CREDIT_LIMIT_EXCEEDED", "O limite de crédito seria ultrapassado."],
        ORDER_ADJUSTMENT_NOTE_REQUIRED: [400, "ORDER_ADJUSTMENT_NOTE_REQUIRED", "Informe a justificativa do ajuste."],
        ORDER_ADJUSTMENT_INVALID: [400, "ORDER_ADJUSTMENT_INVALID", "O ajuste não pode deixar o total negativo."],
        CASH_RECEIVED_BELOW_TOTAL: [400, "CASH_RECEIVED_BELOW_TOTAL", "O dinheiro entregue precisa ser igual ou maior que o total do pedido."],
        CASH_NOT_OPEN: [409, "CASH_NOT_OPEN", "Abra o caixa antes de finalizar a venda."],
      };
      const result = messages[code];
      if (result) return response.status(result[0]).json(jsonError(result[1], result[2], result[0]));
      return response.status(409).json(jsonError("ORDER_FINALIZE_CONFLICT", error instanceof Error ? error.message : "Não foi possível finalizar o pedido.", 409));
    }
  }

  @Patch(":id/status")
  async updateStatus(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma etapa válida para o pedido.", 400));
    }

    try {
      const previousOrder = await this.database.foodOrder.findUnique({
        where: { id },
        include: { conversation: true, items: true },
      });
      if (!previousOrder) {
        return response.status(404).json(jsonError("NOT_FOUND", "Pedido não encontrado.", 404));
      }

      const order = await this.database.$transaction(async tx => {
        const current = await tx.foodOrder.findUniqueOrThrow({ where: { id }, include: { conversation: true, items: true } });
        if (current.status === "cancelled") {
          if (parsed.data.status !== "cancelled") throw new FinancialError("Um pedido cancelado não pode ser reaberto.");
          return current;
        }
        if (parsed.data.status === "cancelled") {
          const entries = await tx.foodFinancialMovement.findMany({ where: saleMovementWhere("order", id) });
          const net = entries.reduce((sum, row) => sum + (row.kind === "receipt" ? row.amountCents : row.kind === "refund" ? -row.amountCents : 0), 0);
          const charge = await tx.creditEntry.findFirst({ where: { referenceType: "food_order", referenceId: id, type: "charge" } });
          if (net > 0 || charge || (current.paymentStatus === "paid" && !entries.length)) throw new FinancialError("Cancele pelo financeiro após conferir os recebimentos e o crediário.");
          if (current.status !== "delivered") await restoreReservedStock(tx, current);
        }
        return tx.foodOrder.update({ where: { id }, data: { status: parsed.data.status }, include: { customer: true, conversation: true, items: { include: { product: true } } } });
      });
      const notification = previousOrder.status === order.status
        ? { sent: false, skipped: true }
        : await this.notifyStatus(order);
      return response.json(jsonData({ order, notification }));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("ORDER_CONFLICT", error.message, 409));
      if (error instanceof Error && error.message.includes("Record to update not found")) {
        return response.status(404).json(jsonError("NOT_FOUND", "Pedido não encontrado.", 404));
      }
      throw error;
    }
  }
}
