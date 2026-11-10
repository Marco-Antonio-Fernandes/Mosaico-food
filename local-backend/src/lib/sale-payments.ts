import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FinancialError, receivedPaymentSchema, recordFinancialMovement } from "./financial-movement";
import { cashSnapshot } from "./cash-ledger";
import { ensureDailyCashSession } from "./cash-session";

export const saleTypeSchema = z.enum(["order", "counter_sale", "assistant_sale"]);
export type SaleType = z.infer<typeof saleTypeSchema>;
export const installmentsSchema = z.array(z.object({ paymentMethod: receivedPaymentSchema, amountCents: z.number().int().positive().max(100_000_000) })).min(1).max(10);
export function saleMovementWhere(type: string, id: string): Prisma.FoodFinancialMovementWhereInput {
  return { OR: [{ referenceType: type, referenceId: id }, { saleType: type, saleId: id }] };
}
export async function saleSummary(tx: Prisma.TransactionClient, type: SaleType, id: string) {
  const order = type === "order" ? await tx.foodOrder.findUnique({ where: { id } }) : null;
  if (type !== "order" && await tx.foodOrder.findUnique({ where: { saleOperationId: id } })) throw new FinancialError("Use a referência do pedido para esta venda.");
  const rows = type !== "order" ? await tx.foodCounterSale.findMany({ where: { financialOperationId: id } }) : [];
  if (!order && !rows.length) throw new FinancialError("Venda não encontrada no controle financeiro.");
  if (type !== "order" && (rows[0].source === "assistant") !== (type === "assistant_sale")) throw new FinancialError("A origem da venda não confere.");
  const totalCents = order?.totalCents ?? rows.reduce((sum, row) => sum + row.totalCents, 0);
  const movements = await tx.foodFinancialMovement.findMany({ where: saleMovementWhere(type, id), orderBy: { occurredAt: "asc" } });
  const receivedCents = movements.filter(row => row.kind === "receipt").reduce((sum, row) => sum + row.amountCents, 0);
  const refundedCents = movements.filter(row => row.kind === "refund").reduce((sum, row) => sum + row.amountCents, 0);
  const cancellation = await tx.foodSaleCancellation.findUnique({ where: { saleType_saleId: { saleType: type, saleId: id } } });
  const credited = await tx.creditEntry.findFirst({ where: { referenceType: type === "order" ? "food_order" : "food_sale", referenceId: id, type: "charge" } });
  const legacyPaid = totalCents > 0 && !movements.length && (order?.paymentStatus === "paid" || rows.some(row => row.paymentStatus === "paid"));
  return { type, id, totalCents, source: order?.source ?? rows[0].source ?? "balcao", description: order?.customerName || rows.map(row => row.productName).join(", ") || "Pedido", createdAt: order?.createdAt ?? rows[0].createdAt,
    receivedCents, refundedCents, pendingCents: Math.max(0, totalCents - receivedCents + refundedCents), movements,
    cancelled: Boolean(cancellation) || order?.status === "cancelled", credited: Boolean(credited), legacyPaid };
}
export async function refreshSalePaymentStatus(tx: Prisma.TransactionClient, type: SaleType, id: string) {
  const sale = await saleSummary(tx, type, id);
  const net = sale.receivedCents - sale.refundedCents;
  const paymentStatus = sale.cancelled ? "cancelled" : net >= sale.totalCents ? "paid" : net > 0 ? "partial" : sale.refundedCents ? "refunded" : "pending";
  const methods = [...new Set(sale.movements.filter(row => row.kind === "receipt").map(row => row.paymentMethod))];
  const paymentMethod = methods.length > 1 ? "split" : methods[0] ?? null;
  if (type === "order") await tx.foodOrder.update({ where: { id }, data: { paymentStatus, paymentMethod } });
  await tx.foodCounterSale.updateMany({ where: { financialOperationId: id }, data: { paymentStatus, paymentMethod } });
  return sale;
}
export async function paySale(tx: Prisma.TransactionClient, type: SaleType, id: string, operationId: string, payments: z.infer<typeof installmentsSchema>) {
  const sale = await saleSummary(tx, type, id);
  const prefix = `installment:${operationId}:`;
  const existing = await tx.foodFinancialMovement.findMany({ where: { operationId: { startsWith: prefix } }, orderBy: { operationId: "asc" } });
  if (existing.length) {
    if (existing.length !== payments.length || payments.some((payment, index) => { const row = existing.find(item => item.operationId === `${prefix}${index}`); return !row || row.saleType !== type || row.saleId !== id || row.amountCents !== payment.amountCents || row.paymentMethod !== payment.paymentMethod; })) throw new FinancialError("Esta operação já foi registrada com outros dados.");
    return sale;
  }
  if (sale.cancelled || sale.credited || sale.legacyPaid) throw new FinancialError("Venda cancelada, em crediário ou com pagamento antigo: confira o histórico antes de receber.");
  const amount = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (amount > sale.pendingCents) throw new FinancialError("O pagamento supera o saldo pendente da venda.");
  for (const [index, payment] of payments.entries()) await recordFinancialMovement(tx, { ...payment, operationId: `${prefix}${index}`, referenceType: "sale_payment", referenceId: `${operationId}:${index}`, saleType: type, saleId: id, source: sale.source, kind: "receipt" });
  return refreshSalePaymentStatus(tx, type, id);
}
export async function refundReceipt(tx: Prisma.TransactionClient, movementId: string, operationId: string, amountCents: number, note: string) {
  const original = await tx.foodFinancialMovement.findUnique({ where: { id: movementId } });
  if (!original || original.kind !== "receipt") throw new FinancialError("Recebimento original não encontrado.");
  const type = saleTypeSchema.safeParse(original.saleType ?? original.referenceType);
  const id = original.saleId ?? original.referenceId;
  const creditPayment = original.referenceType === "credit_payment" ? await tx.creditEntry.findUnique({ where: { id: original.referenceId } }) : null;
  if (!type.success && !creditPayment) throw new FinancialError("Faça a correção deste recebimento pela sua conta de origem.");
  const retry = await tx.foodFinancialMovement.findUnique({ where: { operationId: `refund:${operationId}` } });
  if (retry) {
    if (retry.originalMovementId !== movementId || retry.amountCents !== amountCents || retry.note !== note.trim()) throw new FinancialError("Esta operação já foi registrada com outros dados.");
    return retry;
  }
  const settlement = await tx.foodFinancialMovement.findFirst({ where: { originalMovementId: movementId, kind: "settlement" } });
  const refundAccountId = settlement?.accountId ?? original.accountId;
  const input = { operationId: `refund:${operationId}`, referenceType: "sale_refund", referenceId: operationId, source: original.source, kind: "refund" as const, paymentMethod: receivedPaymentSchema.parse(refundAccountId ? "pix" : original.paymentMethod), amountCents, note, originalMovementId: movementId, saleType: type.success ? type.data : "credit_payment", saleId: id, ...(refundAccountId ? { accountId: refundAccountId } : {}) };
  const refunded = await tx.foodFinancialMovement.aggregate({ where: { originalMovementId: movementId, kind: "refund" }, _sum: { amountCents: true } });
  if (amountCents > original.amountCents - (refunded._sum.amountCents ?? 0)) throw new FinancialError("O estorno supera o saldo do recebimento original.");
  if (refundAccountId) {
    const account = await tx.foodFinanceAccount.findUniqueOrThrow({ where: { id: refundAccountId } });
    const movements = await tx.foodFinancialMovement.findMany({ where: { accountId: refundAccountId } });
    const balance = account.openingBalanceCents + movements.reduce((sum, row) => sum + (["receipt", "settlement", "transfer_in"].includes(row.kind) ? row.amountCents : -row.amountCents), 0);
    if (balance < amountCents) throw new FinancialError("Saldo bancário insuficiente para devolver o recebimento.");
  }
  if (original.paymentMethod === "cash") {
    const session = await ensureDailyCashSession(tx);
    if ((await cashSnapshot(tx, session)).expectedCashCents < amountCents) throw new FinancialError("Dinheiro insuficiente no caixa para devolver.");
  }
  const movement = await recordFinancialMovement(tx, input);
  if (type.success) await refreshSalePaymentStatus(tx, type.data, id);
  if (creditPayment) {
    await tx.creditEntry.create({ data: { creditAccountId: creditPayment.creditAccountId, type: "charge", amountCents, note, occurredAt: new Date(), operationId: `credit_refund:${operationId}`, referenceType: "payment_refund", referenceId: creditPayment.id } });
    await tx.creditAccount.update({ where: { id: creditPayment.creditAccountId }, data: { balanceCents: { increment: amountCents }, version: { increment: 1 } } });
  }
  return movement;
}
