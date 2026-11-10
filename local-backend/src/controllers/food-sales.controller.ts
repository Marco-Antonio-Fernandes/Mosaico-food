import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { recordCounterSale } from "../lib/counter-sale";
import { recordSaleReceipt, salePaymentSchema } from "../lib/financial-movement";

@Controller("api/v1/food/sales")
export class FoodSalesController {
  constructor(private readonly database: PrismaService) {}
  @Get()
  async list(@Req() req: Request, @Res() res: Response) {
    if (rejectUnauthorized(req, res)) return;
    if (!this.database.isConfigured) return databaseUnavailable(res);
    return res.json(jsonData({ sales: await this.database.foodCounterSale.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) }));
  }
  @Post()
  async create(@Req() req: Request, @Res() res: Response) {
    if (rejectUnauthorized(req, res)) return;
    if (!this.database.isConfigured) return databaseUnavailable(res);
    const parsed = z.object({
      operationId: z.string().uuid(),
      paymentMethod: salePaymentSchema,
      creditCustomerId: z.string().uuid().nullable().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(100000),
        unitPriceCents: z.number().int().nonnegative().max(1000000),
        customization: z.object({
          selectedQuantity: z.number().int().nonnegative().max(1000).optional(),
          removedQuantity: z.number().int().nonnegative().max(1000).optional(),
          addedItems: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
        }).nullable().optional().default(null),
        adjustmentCents: z.number().int().min(-1000000).max(1000000).default(0),
        adjustmentNote: z.string().trim().max(240).nullable().optional().default(null),
        isGift: z.boolean().default(false),
      })).min(1).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_SALE", "Confira os itens da venda.", 400));
    if (parsed.data.paymentMethod === "brinde" && parsed.data.items.some(item => !item.isGift)) {
      return res.status(400).json(jsonError("GIFT_ITEMS_REQUIRED", "Para registrar como brinde, marque todos os itens da venda como brinde.", 400));
    }
    if (parsed.data.paymentMethod === "crediario" && !parsed.data.creditCustomerId) return res.status(400).json(jsonError("CREDIT_CUSTOMER_REQUIRED", "Selecione o cliente do crediário.", 400));
    if (parsed.data.items.some(item => (item.isGift || item.adjustmentCents !== 0) && !item.adjustmentNote?.trim())) {
      return res.status(400).json(jsonError("SALE_ADJUSTMENT_NOTE_REQUIRED", "Informe a justificativa do brinde ou da alteração de valor.", 400));
    }
    const { operationId, ...payload } = parsed.data;
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    try {
      await this.database.$transaction(async tx => {
        const previous = await tx.foodCounterBatch.findUnique({ where: { id: operationId } });
        if (previous) { if (previous.fingerprint !== fingerprint) throw new Error("Esta operação já foi usada para outra venda."); return; }
        const totalCents = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
        const account = payload.paymentMethod === "crediario"
          ? await tx.creditAccount.findUnique({ where: { customerId: payload.creditCustomerId! } })
          : null;
        if (payload.paymentMethod === "crediario" && !account) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
        if (account?.creditLimitCents !== null && account && account.balanceCents + totalCents > account.creditLimitCents) throw new Error("CREDIT_LIMIT_EXCEEDED");
        for (const item of payload.items) await recordCounterSale(tx, { ...item, id: randomUUID(), operationId, source: "balcao", totalCents: item.quantity * item.unitPriceCents, paymentMethod: payload.paymentMethod });
        await recordSaleReceipt(tx, { referenceType: "counter_sale", referenceId: operationId, source: "balcao", totalCents, paymentMethod: payload.paymentMethod });
        if (account) {
          await tx.creditEntry.create({ data: { creditAccountId: account.id, type: "charge", amountCents: totalCents, note: `Venda Food ${operationId}`, occurredAt: new Date(), operationId, referenceType: "food_sale", referenceId: operationId } });
          await tx.creditAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: totalCents }, version: { increment: 1 } } });
        }
        await tx.foodCounterBatch.create({ data: { id: operationId, fingerprint } });
      });
      return res.json(jsonData({ message: "Venda registrada e estoque atualizado." }));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, [number, string, string]> = {
        CASH_NOT_OPEN: [409, "CASH_NOT_OPEN", "Abra o caixa antes de registrar uma venda."],
        CREDIT_ACCOUNT_NOT_FOUND: [404, "CREDIT_ACCOUNT_NOT_FOUND", "O cliente não possui conta de crediário."],
        CREDIT_LIMIT_EXCEEDED: [409, "CREDIT_LIMIT_EXCEEDED", "O limite de crédito seria ultrapassado."],
      };
      const result = messages[code];
      return res.status(result?.[0] ?? 409).json(jsonError(result?.[1] ?? "SALE_CONFLICT", result?.[2] ?? (error instanceof Error ? error.message : "Não foi possível registrar."), result?.[0] ?? 409));
    }
  }
}
