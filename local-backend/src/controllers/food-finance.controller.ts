import { Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { businessDate, FinancialError, movementSign, receivedPaymentSchema, recordFinancialMovement } from "../lib/financial-movement";
import { ensureDailyCashSession } from "../lib/cash-session";
import { installmentsSchema, paySale, refundReceipt, saleSummary, saleTypeSchema } from "../lib/sale-payments";
import { cashSnapshot } from "../lib/cash-ledger";

const cents = z.number().int().positive().max(100_000_000);
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const operation = z.object({ operationId: uuid });
const note = z.string().trim().min(3).max(500);
async function bankBalance(tx: Prisma.TransactionClient, id: string) {
  const account = await tx.foodFinanceAccount.findUnique({ where: { id } });
  if (!account) throw new FinancialError("Conta bancária não encontrada.");
  const rows = await tx.foodFinancialMovement.findMany({ where: { accountId: id } });
  return { ...account, balanceCents: account.openingBalanceCents + rows.reduce((sum, row) => sum + movementSign(row.kind) * row.amountCents, 0) };
}

@Controller("api/v1/food/finance")
export class FoodFinanceController {
  constructor(private readonly database: PrismaService) {}
  private allowed(req: Request, res: Response) {
    if (rejectUnauthorized(req, res)) return false;
    if (!this.database.isConfigured) { databaseUnavailable(res); return false; }
    return true;
  }
  private async execute(res: Response, work: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    try { return res.json(jsonData(await this.database.$transaction(work, { timeout: 30000 }))); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && ["P2002", "P2034", "P2028"].includes(String(error.code))) return res.status(409).json(jsonError("FINANCE_CONFLICT", "Os dados mudaram durante a operação. Atualize e confira antes de repetir.", 409));
      if (error instanceof FinancialError) return res.status(409).json(jsonError("FINANCE_CONFLICT", error.message, 409)); throw error; }
  }
  private async read(res: Response, work: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    // SQLite interactive transactions reserve the writer; dashboard reads must not reserve it.
    try { return res.json(jsonData(await work(this.database))); }
    catch (error) { if (error instanceof FinancialError) return res.status(409).json(jsonError("FINANCE_CONFLICT", error.message, 409)); throw error; }
  }
  @Get("sales")
  async sales(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    return this.read(res, async tx => {
      const orders = await tx.foodOrder.findMany({ orderBy: { createdAt: "desc" } });
      const rows = await tx.foodCounterSale.findMany({ where: { financialOperationId: { not: null } }, orderBy: { createdAt: "desc" } });
      const orderOperations = new Set(orders.map(row => row.saleOperationId));
      const seen = new Set<string>();
      const sales = [];
      for (const order of orders) sales.push(await saleSummary(tx, "order", order.id));
      for (const row of rows) {
        if (!row.financialOperationId || seen.has(row.financialOperationId) || orderOperations.has(row.financialOperationId)) continue;
        seen.add(row.financialOperationId);
        sales.push(await saleSummary(tx, row.source === "assistant" ? "assistant_sale" : "counter_sale", row.financialOperationId));
      }
      return { sales: sales.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) };
    });
  }
  @Post("sales/:type/:id/payments")
  async payment(@Req() req: Request, @Res() res: Response, @Param("type") type: string, @Param("id") id: string) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ type: saleTypeSchema, id: uuid, payments: installmentsSchema }).safeParse({ ...req.body, type, id });
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_PAYMENT", "Confira a venda e os valores dos pagamentos.", 400));
    return this.execute(res, async tx => ({ sale: await paySale(tx, parsed.data.type, id, parsed.data.operationId, parsed.data.payments) }));
  }
  @Get("credit-receipts")
  async creditReceipts(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    return this.read(res, async tx => {
      const rows = await tx.foodFinancialMovement.findMany({ where: { referenceType: "credit_payment", kind: "receipt" }, orderBy: { occurredAt: "desc" } });
      const creditReceipts = [];
      for (const row of rows) {
        const payment = await tx.creditEntry.findUnique({ where: { id: row.referenceId }, include: { creditAccount: { include: { customer: true } } } });
        const refunds = await tx.foodFinancialMovement.aggregate({ where: { originalMovementId: row.id, kind: "refund" }, _sum: { amountCents: true } });
        creditReceipts.push({ ...row, customerName: payment?.creditAccount.customer.name ?? "Cliente", availableCents: row.amountCents - (refunds._sum.amountCents ?? 0) });
      }
      return { creditReceipts };
    });
  }
  @Post("refunds")
  async refund(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ movementId: uuid, amountCents: cents, note }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_REFUND", "Informe recebimento, valor e justificativa.", 400));
    return this.execute(res, async tx => ({ movement: await refundReceipt(tx, parsed.data.movementId, parsed.data.operationId, parsed.data.amountCents, parsed.data.note) }));
  }
  @Post("sales/:type/:id/cancel")
  async cancel(@Req() req: Request, @Res() res: Response, @Param("type") type: string, @Param("id") id: string) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ type: saleTypeSchema, id: uuid, note }).safeParse({ ...req.body, type, id });
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_CANCELLATION", "Informe a venda e a justificativa.", 400));
    return this.execute(res, async tx => {
      const data = parsed.data;
      const previous = await tx.foodSaleCancellation.findUnique({ where: { id: data.operationId } });
      if (previous) {
        if (previous.saleType !== type || previous.saleId !== id || previous.note !== data.note) throw new FinancialError("Esta operação já foi registrada com outros dados.");
        return { sale: await saleSummary(tx, data.type, id) };
      }
      const sale = await saleSummary(tx, data.type, id);
      if (sale.cancelled || sale.legacyPaid) throw new FinancialError("Confira o cancelamento ou o pagamento antigo antes de continuar.");
      if (sale.receivedCents !== sale.refundedCents) throw new FinancialError("Estorne todos os recebimentos antes de cancelar a venda.");
      const charge = await tx.creditEntry.findFirst({ where: { referenceType: type === "order" ? "food_order" : "food_sale", referenceId: id, type: "charge" } });
      if (charge) {
        const account = await tx.creditAccount.findUniqueOrThrow({ where: { id: charge.creditAccountId } });
        if (account.balanceCents < charge.amountCents) throw new FinancialError("A cobrança já recebeu pagamentos. Concilie o crediário antes de cancelar.");
        await tx.creditEntry.create({ data: { creditAccountId: account.id, type: "refund", amountCents: charge.amountCents, operationId: data.operationId, referenceType: "sale_cancellation", referenceId: id, note: data.note, occurredAt: new Date() } });
        await tx.creditAccount.update({ where: { id: account.id }, data: { balanceCents: { decrement: charge.amountCents }, version: { increment: 1 } } });
      }
      await tx.foodSaleCancellation.create({ data: { id: data.operationId, saleType: type, saleId: id, note: data.note } });
      if (type === "order") await tx.foodOrder.update({ where: { id }, data: { status: "cancelled", paymentStatus: "cancelled" } });
      await tx.foodCounterSale.updateMany({ where: { financialOperationId: id }, data: { paymentStatus: "cancelled" } });
      return { sale: await saleSummary(tx, data.type, id) };
    });
  }
  @Get("accounts")
  async accounts(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    return this.read(res, async tx => ({ accounts: await Promise.all((await tx.foodFinanceAccount.findMany()).map(account => bankBalance(tx, account.id))) }));
  }
  @Post("accounts")
  async account(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ name: z.string().trim().min(2).max(120), openingBalanceCents: z.number().int().min(-100_000_000).max(100_000_000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_ACCOUNT", "Confira o nome e o saldo inicial da conta.", 400));
    return this.execute(res, async tx => {
      const { operationId: id, ...data } = parsed.data;
      const previous = await tx.foodFinanceAccount.findUnique({ where: { id } });
      if (previous && (previous.name !== data.name || previous.openingBalanceCents !== data.openingBalanceCents)) throw new FinancialError("Esta operação já foi usada para outra conta.");
      return { account: previous ?? await tx.foodFinanceAccount.create({ data: { id, ...data } }) };
    });
  }
  @Get("titles")
  async titles(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    return this.read(res, async tx => ({ titles: await tx.foodFinanceTitle.findMany({ orderBy: { dueDate: "asc" } }) }));
  }
  @Post("titles")
  async title(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ kind: z.enum(["payable", "receivable"]), description: z.string().trim().min(3).max(200), category: z.string().trim().min(2).max(80), amountCents: cents, dueDate: date }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_TITLE", "Confira descrição, categoria, valor e vencimento.", 400));
    return this.execute(res, async tx => {
      const { operationId: id, ...data } = parsed.data;
      const previous = await tx.foodFinanceTitle.findUnique({ where: { id } });
      if (previous && Object.entries(data).some(([key, value]) => previous[key as keyof typeof data] !== value)) throw new FinancialError("Esta operação já foi usada para outra conta a pagar ou receber.");
      return { title: previous ?? await tx.foodFinanceTitle.create({ data: { id, ...data } }) };
    });
  }
  @Post("titles/:id/settle")
  async settleTitle(@Req() req: Request, @Res() res: Response, @Param("id") id: string) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ amountCents: cents, paymentMethod: receivedPaymentSchema, accountId: uuid.optional() }).safeParse(req.body);
    if (!parsed.success || !uuid.safeParse(id).success) return res.status(400).json(jsonError("INVALID_SETTLEMENT", "Confira valor, forma e conta da baixa.", 400));
    return this.execute(res, async tx => {
      const title = await tx.foodFinanceTitle.findUnique({ where: { id } });
      if (!title) throw new FinancialError("Conta a pagar ou receber não encontrada.");
      const { operationId, ...data } = parsed.data;
      const input = { ...data, operationId: `title:${operationId}`, referenceType: "title_payment", referenceId: operationId, saleType: "finance_title", saleId: id, source: "financeiro", kind: title.kind === "payable" ? "expense" as const : "receipt" as const, note: `${title.category}: ${title.description}` };
      if (await tx.foodFinancialMovement.findUnique({ where: { operationId: input.operationId } })) return { movement: await recordFinancialMovement(tx, input) };
      if (data.paymentMethod !== "cash" && !data.accountId) throw new FinancialError("Selecione a conta bancária para esta baixa.");
      if (["card_credit", "card_debit", "meal_voucher"].includes(data.paymentMethod)) throw new FinancialError("Use dinheiro ou Pix para baixar esta conta.");
      if (data.amountCents > title.amountCents - title.settledCents) throw new FinancialError("A baixa supera o saldo pendente.");
      if (title.kind === "payable") {
        const available = data.accountId ? (await bankBalance(tx, data.accountId)).balanceCents : (await cashSnapshot(tx, await ensureDailyCashSession(tx))).expectedCashCents;
        if (data.amountCents > available) throw new FinancialError("Saldo insuficiente para pagar esta conta.");
      }
      const movement = await recordFinancialMovement(tx, input);
      const settledCents = title.settledCents + data.amountCents;
      await tx.foodFinanceTitle.update({ where: { id }, data: { settledCents, status: settledCents === title.amountCents ? "settled" : "partial" } });
      return { movement };
    });
  }
  @Post("transfers")
  async transfer(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ fromAccountId: uuid, toAccountId: uuid, amountCents: cents, note }).refine(data => data.fromAccountId !== data.toAccountId).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(jsonError("INVALID_TRANSFER", "Selecione contas diferentes, valor e justificativa.", 400));
    return this.execute(res, async tx => {
      const data = parsed.data;
      if (!await tx.foodFinancialMovement.findUnique({ where: { operationId: `transfer:${data.operationId}:out` } }) && (await bankBalance(tx, data.fromAccountId)).balanceCents < data.amountCents) throw new FinancialError("Saldo insuficiente para transferir.");
      const base = { referenceType: "bank_transfer", referenceId: data.operationId, source: "transferencia", paymentMethod: "pix" as const, amountCents: data.amountCents, note: data.note };
      const outgoing = await recordFinancialMovement(tx, { ...base, operationId: `transfer:${data.operationId}:out`, kind: "transfer_out", accountId: data.fromAccountId });
      const incoming = await recordFinancialMovement(tx, { ...base, operationId: `transfer:${data.operationId}:in`, kind: "transfer_in", accountId: data.toAccountId });
      return { outgoing, incoming };
    });
  }
  @Get("cards")
  async cards(@Req() req: Request, @Res() res: Response) {
    if (!this.allowed(req, res)) return;
    return this.read(res, async tx => {
      const rows = await tx.foodFinancialMovement.findMany({ where: { kind: "receipt", paymentMethod: { in: ["pix", "card_credit", "card_debit", "meal_voucher"] }, referenceType: { not: "title_payment" } }, orderBy: { occurredAt: "desc" } });
      const cards = [];
      for (const row of rows) {
        const related = await tx.foodFinancialMovement.findMany({ where: { originalMovementId: row.id } });
        const settlement = related.find(item => item.kind === "settlement");
        cards.push({ ...row, dueDate: (await tx.foodCardSchedule.findUnique({ where: { id: row.id } }))?.dueDate ?? null, refundableCents: row.amountCents - related.filter(item => item.kind === "refund").reduce((sum, item) => sum + item.amountCents, 0), settled: Boolean(settlement), netCents: settlement?.amountCents ?? null, feeCents: settlement ? row.amountCents - related.filter(item => item.kind === "refund" && item.occurredAt <= settlement.occurredAt).reduce((sum, item) => sum + item.amountCents, 0) - settlement.amountCents : null });
      }
      return { cards };
    });
  }
  @Post("cards/:id/schedule")
  async scheduleCard(@Req() req: Request, @Res() res: Response, @Param("id") id: string) {
    if (!this.allowed(req, res)) return;
    const parsed = z.object({ dueDate: date }).safeParse(req.body);
    if (!parsed.success || !uuid.safeParse(id).success) return res.status(400).json(jsonError("INVALID_DATE", "Informe uma data de previsão válida.", 400));
    return this.execute(res, async tx => {
      const card = await tx.foodFinancialMovement.findUnique({ where: { id } });
      if (!card || card.kind !== "receipt" || !["card_credit", "card_debit", "meal_voucher"].includes(card.paymentMethod)) throw new FinancialError("Recebível não encontrado.");
      if (await tx.foodFinancialMovement.findFirst({ where: { originalMovementId: id, kind: "settlement" } })) throw new FinancialError("Recebível já liquidado.");
      return { schedule: await tx.foodCardSchedule.upsert({ where: { id }, create: { id, dueDate: parsed.data.dueDate }, update: { dueDate: parsed.data.dueDate } }) };
    });
  }
  @Post("cards/:id/settle")
  async settleCard(@Req() req: Request, @Res() res: Response, @Param("id") id: string) {
    if (!this.allowed(req, res)) return;
    const parsed = operation.extend({ accountId: uuid, feeCents: z.number().int().nonnegative().max(100_000_000) }).safeParse(req.body);
    if (!parsed.success || !uuid.safeParse(id).success) return res.status(400).json(jsonError("INVALID_CARD_SETTLEMENT", "Informe conta bancária e taxa da liquidação.", 400));
    return this.execute(res, async tx => {
      const original = await tx.foodFinancialMovement.findUnique({ where: { id } });
      if (!original || original.kind !== "receipt" || !["pix", "card_credit", "card_debit", "meal_voucher"].includes(original.paymentMethod)) throw new FinancialError("Recebível de cartão não encontrado.");
      if (original.paymentMethod === "pix" && parsed.data.feeCents !== 0) throw new FinancialError("A vinculação de Pix à conta deve manter o valor recebido, sem taxa presumida.");
      const related = await tx.foodFinancialMovement.findMany({ where: { originalMovementId: id } });
      const previous = related.find(row => row.kind === "settlement");
      if (previous) {
        if (previous.operationId !== `settlement:${parsed.data.operationId}` || previous.accountId !== parsed.data.accountId || previous.note !== `Taxa: ${parsed.data.feeCents}`) throw new FinancialError("Este recebível já foi liquidado.");
        return { movement: previous };
      }
      const net = original.amountCents - related.filter(row => row.kind === "refund").reduce((sum, row) => sum + row.amountCents, 0) - parsed.data.feeCents;
      if (net <= 0) throw new FinancialError("A taxa deve ser menor que o saldo a liquidar.");
      return { movement: await recordFinancialMovement(tx, { operationId: `settlement:${parsed.data.operationId}`, referenceType: "card_settlement", referenceId: id, originalMovementId: id, source: "cartao", kind: "settlement", paymentMethod: "pix", amountCents: net, accountId: parsed.data.accountId, note: `Taxa: ${parsed.data.feeCents}` }) };
    });
  }
  @Get("flow")
  async flow(@Req() req: Request, @Res() res: Response, @Query("from") from: string, @Query("to") to: string) {
    if (!this.allowed(req, res)) return;
    const range = z.object({ from: date, to: date }).refine(data => data.from <= data.to && Date.parse(data.to) - Date.parse(data.from) <= 366 * 86400000).safeParse({ from, to });
    if (!range.success) return res.status(400).json(jsonError("INVALID_PERIOD", "Selecione um período de até 366 dias.", 400));
    return this.read(res, async tx => {
      const start = new Date(`${from}T00:00:00-03:00`);
      const end = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86400000);
      const movements = await tx.foodFinancialMovement.findMany({ where: { occurredAt: { gte: start, lt: end } }, orderBy: { occurredAt: "asc" } });
      const titles = await tx.foodFinanceTitle.findMany({ where: { dueDate: { gte: from, lte: to }, status: { not: "settled" } } });
      const days = new Map<string, { date: string; incomingCents: number; outgoingCents: number; forecastIncomingCents: number; forecastOutgoingCents: number }>();
      const day = (key: string) => { if (!days.has(key)) days.set(key, { date: key, incomingCents: 0, outgoingCents: 0, forecastIncomingCents: 0, forecastOutgoingCents: 0 }); return days.get(key)!; };
      for (const row of movements) {
        // Card capture is a receivable; bank settlement is the actual inflow. Transfers are neutral.
        if (["supply", "withdrawal", "transfer_in", "transfer_out"].includes(row.kind) || (row.kind === "receipt" && ["card_credit", "card_debit", "meal_voucher"].includes(row.paymentMethod))) continue;
        if (row.kind === "refund" && ["card_credit", "card_debit", "meal_voucher"].includes(row.paymentMethod) && !row.accountId) continue;
        if (row.kind === "settlement" && row.originalMovementId && (await tx.foodFinancialMovement.findUnique({ where: { id: row.originalMovementId } }))?.paymentMethod === "pix") continue;
        const target = day(businessDate(row.occurredAt));
        if (movementSign(row.kind) > 0) target.incomingCents += row.amountCents; else target.outgoingCents += row.amountCents;
      }
      for (const title of titles) { const target = day(title.dueDate); if (title.kind === "receivable") target.forecastIncomingCents += title.amountCents - title.settledCents; else target.forecastOutgoingCents += title.amountCents - title.settledCents; }

      const accounts = await Promise.all((await tx.foodFinanceAccount.findMany()).map(account => bankBalance(tx, account.id)));
      const credit = await tx.creditAccount.aggregate({ _sum: { balanceCents: true } });
      const pendingCards = await tx.foodFinancialMovement.findMany({ where: { kind: "receipt", paymentMethod: { in: ["card_credit", "card_debit", "meal_voucher"] } } });
      let cardReceivableCents = 0;
      for (const card of pendingCards) { const related = await tx.foodFinancialMovement.findMany({ where: { originalMovementId: card.id } }); if (!related.some(row => row.kind === "settlement")) cardReceivableCents += card.amountCents - related.filter(row => row.kind === "refund").reduce((sum, row) => sum + row.amountCents, 0); }
      for (const schedule of await tx.foodCardSchedule.findMany({ where: { dueDate: { gte: from, lte: to } } })) {
        const card = pendingCards.find(row => row.id === schedule.id);
        if (!card) continue;
        const related = await tx.foodFinancialMovement.findMany({ where: { originalMovementId: card.id } });
        if (!related.some(row => row.kind === "settlement")) day(schedule.dueDate).forecastIncomingCents += card.amountCents - related.filter(row => row.kind === "refund").reduce((sum, row) => sum + row.amountCents, 0);
      }
      const daysList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
      const pendingOrders = await tx.foodOrder.findMany({ where: { status: { not: "cancelled" }, paymentStatus: { in: ["pending", "partial", "refunded"] }, OR: [{ paymentMethod: null }, { paymentMethod: { not: "crediario" } }] } });
      let saleReceivableCents = 0;
      for (const order of pendingOrders) { const sale = await saleSummary(tx, "order", order.id); if (!sale.credited && !sale.cancelled) saleReceivableCents += sale.pendingCents; }
      const pendingSales = await tx.foodCounterSale.findMany({ where: { financialOperationId: { not: null }, paymentStatus: { in: ["pending", "partial", "refunded"] } } });
      const seen = new Set<string>();
      for (const row of pendingSales) { if (!row.financialOperationId || seen.has(row.financialOperationId) || await tx.foodOrder.findUnique({ where: { saleOperationId: row.financialOperationId } })) continue; seen.add(row.financialOperationId); const sale = await saleSummary(tx, row.source === "assistant" ? "assistant_sale" : "counter_sale", row.financialOperationId); if (!sale.credited && !sale.cancelled) saleReceivableCents += sale.pendingCents; }
      return { from, to, saleReceivableCents, days: daysList, accounts, creditReceivableCents: credit._sum.balanceCents ?? 0, cardReceivableCents, movements };
    });
  }
}
