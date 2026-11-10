import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { businessDate, ensureDailyCashSession } from "./cash-session";

export { businessDate } from "./cash-session";

export const receivedPaymentMethods = ["cash", "pix", "card_credit", "card_debit", "meal_voucher"] as const;
export const receivedPaymentSchema = z.preprocess(value => value === "card" ? "card_credit" : value, z.enum(receivedPaymentMethods));
export const salePaymentSchema = z.preprocess(value => value === "card" ? "card_credit" : value, z.enum([...receivedPaymentMethods, "crediario", "brinde"]));
export type ReceivedPaymentMethod = z.infer<typeof receivedPaymentSchema>;
export type FinancialMovementInput = {
  operationId: string;
  referenceType: string;
  referenceId: string;
  source: string;
  kind: "receipt" | "supply" | "withdrawal" | "expense" | "refund" | "settlement" | "transfer_in" | "transfer_out";
  paymentMethod: ReceivedPaymentMethod;
  amountCents: number;
  note?: string | null;
  occurredAt?: Date;
  saleType?: string;
  saleId?: string;
  originalMovementId?: string;
  accountId?: string;
};

export class FinancialError extends Error {}

export async function recordFinancialMovement(tx: Prisma.TransactionClient, input: FinancialMovementInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 100_000_000) {
    throw new FinancialError("Informe um valor entre R$ 0,01 e R$ 1.000.000,00.");
  }
  const existing = await tx.foodFinancialMovement.findUnique({ where: { operationId: input.operationId } });
  if (existing) {
    if (existing.referenceType !== input.referenceType || existing.referenceId !== input.referenceId || existing.source !== input.source
      || existing.kind !== input.kind || existing.paymentMethod !== input.paymentMethod || existing.amountCents !== input.amountCents
      || existing.note !== (input.note?.trim() || null)
      || existing.saleType !== (input.saleType ?? null) || existing.saleId !== (input.saleId ?? null)
      || existing.originalMovementId !== (input.originalMovementId ?? null) || existing.accountId !== (input.accountId ?? null)) {
      throw new FinancialError("Esta operação já foi registrada com outros dados. Confira o lançamento original.");
    }
    return existing;
  }
  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  if (occurredAt.getTime() > now.getTime() + 5000) throw new FinancialError("O recebimento não pode ter data futura.");
  if (input.accountId) {
    if (input.paymentMethod === "cash") throw new FinancialError("Use o caixa para movimentações em dinheiro.");
    if (!await tx.foodFinanceAccount.findUnique({ where: { id: input.accountId } })) throw new FinancialError("Conta bancária não encontrada.");
  }
  const activeSession = !input.accountId && businessDate(occurredAt) === businessDate(now)
    ? await ensureDailyCashSession(tx, now)
    : await tx.foodCashSession.findFirst({ where: { status: "open" }, orderBy: { openedAt: "desc" } });
  const session = !input.accountId && activeSession?.status === "open" && occurredAt >= activeSession.openedAt ? activeSession : null;
  if (input.paymentMethod === "cash" && !session) throw new FinancialError("Abra o caixa antes de registrar uma movimentação em dinheiro.");
  if (session) {
    // Serialize receipt creation with closure so no movement can enter a closed session.
    const locked = await tx.foodCashSession.updateMany({ where: { id: session.id, status: "open" }, data: { updatedAt: new Date() } });
    if (locked.count !== 1) throw new FinancialError("O caixa foi fechado. Confira a operação antes de tentar novamente.");
  }
  return tx.foodFinancialMovement.create({ data: { ...input, occurredAt, note: input.note?.trim() || null, cashSessionId: session?.id ?? null } });
}

export async function recordSaleReceipt(tx: Prisma.TransactionClient, input: {
  referenceType: "counter_sale" | "order" | "assistant_sale";
  referenceId: string;
  source: string;
  totalCents: number;
  paymentMethod: string | null;
}) {
  const installments = await tx.foodFinancialMovement.findMany({ where: { saleType: input.referenceType, saleId: input.referenceId } });
  if (installments.length) {
    const paid = installments.reduce((sum, row) => sum + (row.kind === "receipt" ? row.amountCents : row.kind === "refund" ? -row.amountCents : 0), 0);
    if (paid > input.totalCents) throw new FinancialError("O total é menor que o valor recebido. Estorne a diferença primeiro.");
    return null;
  }
  const previous = await tx.foodFinancialMovement.findUnique({ where: { referenceType_referenceId_kind: { referenceType: input.referenceType, referenceId: input.referenceId, kind: "receipt" } } });
  if (previous && (previous.amountCents !== input.totalCents || previous.paymentMethod !== (input.paymentMethod === "card" ? "card_credit" : input.paymentMethod))) {
    throw new FinancialError("A venda já possui recebimento. Confira o lançamento original antes de alterar o valor ou o pagamento.");
  }
  if (!input.paymentMethod || input.paymentMethod === "crediario" || input.paymentMethod === "brinde" || input.totalCents === 0) return null;
  const paymentMethod = receivedPaymentSchema.parse(input.paymentMethod);
  return recordFinancialMovement(tx, {
    operationId: previous?.operationId ?? `${input.referenceType}:${input.referenceId}:receipt`,
    referenceType: input.referenceType, referenceId: input.referenceId, source: input.source,
    amountCents: input.totalCents, paymentMethod, kind: "receipt",
  });
}

export const incomingKinds = ["receipt", "supply", "settlement", "transfer_in"];
export function movementSign(kind: string) { return incomingKinds.includes(kind) ? 1 : -1; }
