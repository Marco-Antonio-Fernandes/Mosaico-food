import type { PrismaClient } from "@prisma/client";

import { z } from "zod";
import { FinancialError, receivedPaymentSchema, recordFinancialMovement } from "./financial-movement";

export const CREDIT_ENTRY_TYPES = ["charge", "payment", "refund"] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export const creditEntryInputSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(CREDIT_ENTRY_TYPES),
  amountCents: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
  occurredAt: z.string().datetime().optional(),
  paymentMethod: receivedPaymentSchema.optional(),
}).refine(value => value.type !== "payment" || Boolean(value.paymentMethod), { path: ["paymentMethod"], message: "Informe como o pagamento foi recebido." });

export type CreditEntryInput = z.infer<typeof creditEntryInputSchema>;

export function creditEntryPayload(input: CreditEntryInput) {
  return {
    customerId: input.customerId,
    type: input.type,
    amountCents: input.amountCents,
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  };
}

function balanceDelta(type: CreditEntryType, amountCents: number): number {
  if (type === "charge") {
    return amountCents;
  }

  if (type === "payment" || type === "refund") {
    return -amountCents;
  }

  return amountCents;
}

export async function createCreditEntry(
  db: PrismaClient,
  input: CreditEntryInput,
  operationId: string,
  entryId?: string,
) {
  return db.$transaction(async (transaction) => {
    const existingEntry = await transaction.creditEntry.findUnique({
      where: { operationId },
      include: { creditAccount: true },
    });

    if (existingEntry) {
      if (existingEntry.creditAccount.customerId !== input.customerId || existingEntry.type !== input.type || existingEntry.amountCents !== input.amountCents
        || existingEntry.paymentMethod !== (input.paymentMethod ?? null) || existingEntry.note !== (input.note ?? null)
        || (input.occurredAt && existingEntry.occurredAt.getTime() !== new Date(input.occurredAt).getTime())) {
        throw new FinancialError("Esta operação já foi registrada com outros dados.");
      }
      return { entry: existingEntry, duplicate: true };
    }

    const account = await transaction.creditAccount.findUnique({
      where: { customerId: input.customerId },
    });

    if (!account) {
      throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
    }

    if (input.type === "charge" && account.creditLimitCents !== null && account.balanceCents + input.amountCents > account.creditLimitCents) {
      throw new Error("CREDIT_LIMIT_EXCEEDED");
    }
    if (input.type === "payment" && input.amountCents > account.balanceCents) {
      throw new Error("PAYMENT_EXCEEDS_BALANCE");
    }

    const entry = await transaction.creditEntry.create({
      data: {
        ...(entryId ? { id: entryId } : {}),
        creditAccountId: account.id,
        type: input.type,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        note: input.note,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        operationId,
      },
    });

    if (input.type === "payment" && input.paymentMethod) {
      await recordFinancialMovement(transaction, {
        operationId: `credit_payment:${operationId}`, referenceType: "credit_payment", referenceId: entry.id,
        source: "crediario", kind: "receipt", paymentMethod: input.paymentMethod, amountCents: input.amountCents,
        note: input.note, occurredAt: entry.occurredAt,
      });
    }

    await transaction.creditAccount.update({
      where: { id: account.id },
      data: {
        balanceCents: {
          increment: balanceDelta(input.type, input.amountCents),
        },
        version: { increment: 1 },
      },
    });

    return { entry, duplicate: false };
  });
}
