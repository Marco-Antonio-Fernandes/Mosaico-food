import type { FoodCashSession, Prisma } from "@prisma/client";
import { businessDate, movementSign, receivedPaymentMethods } from "./financial-movement";

export function emptyPaymentTotals() {
  return { cash: 0, pix: 0, card_credit: 0, card_debit: 0, meal_voucher: 0, crediario: 0 };
}

export async function cashSnapshot(tx: Prisma.TransactionClient, session: FoodCashSession | null) {
  const totals = emptyPaymentTotals();
  const cashBreakdown = { openingCashCents: session?.openingCashCents ?? 0, receiptsCents: 0, suppliesCents: 0, withdrawalsCents: 0, expensesCents: 0, refundsCents: 0 };
  if (!session) return { session: null, totals, cashBreakdown, expectedCashCents: 0, movements: [], movementCount: 0, legacySaleCount: 0 };
  const entries = await tx.foodFinancialMovement.findMany({ where: { cashSessionId: session.id }, orderBy: { createdAt: "desc" } });
  // Older rows remain visible without inventing their origin or a receipt date.
  const legacySales = await tx.foodCounterSale.findMany({
    where: { financialOperationId: null, createdAt: { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) } },
    select: { paymentMethod: true, paymentStatus: true, totalCents: true },
  });
  let cashDelta = 0;
  for (const entry of entries) {
    if (["receipt", "refund"].includes(entry.kind) && receivedPaymentMethods.includes(entry.paymentMethod as typeof receivedPaymentMethods[number])) {
      totals[entry.paymentMethod as typeof receivedPaymentMethods[number]] += movementSign(entry.kind) * entry.amountCents;
    }
    if (entry.paymentMethod === "cash") cashDelta += movementSign(entry.kind) * entry.amountCents;
    if (entry.kind === "refund" && entry.paymentMethod === "cash") cashBreakdown.refundsCents += entry.amountCents;
    if (entry.kind === "supply") cashBreakdown.suppliesCents += entry.amountCents;
    if (entry.kind === "withdrawal") cashBreakdown.withdrawalsCents += entry.amountCents;
    if (entry.kind === "expense") cashBreakdown.expensesCents += entry.amountCents;
  }
  for (const sale of legacySales) {
    if (sale.paymentMethod === "crediario") totals.crediario += sale.totalCents;
    else if (sale.paymentStatus === "paid") {
      const method = sale.paymentMethod === "card" ? "card_credit" : sale.paymentMethod;
      if (method && receivedPaymentMethods.includes(method as typeof receivedPaymentMethods[number])) totals[method as typeof receivedPaymentMethods[number]] += sale.totalCents;
      if (method === "cash") cashDelta += sale.totalCents;
    }
  }
  const expectedCashCents = session.status === "closed" ? session.expectedCashCents ?? session.openingCashCents + cashDelta : session.openingCashCents + cashDelta;
  cashBreakdown.receiptsCents = totals.cash + cashBreakdown.refundsCents;
  return { session: { ...session, expectedCashCents }, totals, cashBreakdown, expectedCashCents, movements: entries.slice(0, 200), movementCount: entries.length, legacySaleCount: legacySales.length };
}

export async function unassignedReceipts(tx: Prisma.TransactionClient) {
  const date = businessDate();
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 86400000);
  const entries = await tx.foodFinancialMovement.findMany({ where: { cashSessionId: null, accountId: null, occurredAt: { gte: start, lt: end } }, orderBy: { occurredAt: "desc" } });
  const totals = emptyPaymentTotals();
  for (const entry of entries) {
    if (["receipt", "refund"].includes(entry.kind) && receivedPaymentMethods.includes(entry.paymentMethod as typeof receivedPaymentMethods[number])) totals[entry.paymentMethod as typeof receivedPaymentMethods[number]] += movementSign(entry.kind) * entry.amountCents;
  }
  return { date, totals, movements: entries.slice(0, 200), movementCount: entries.length };
}
