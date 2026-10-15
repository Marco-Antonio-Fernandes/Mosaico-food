import { z } from "zod";
import { foodApi } from "@/lib/food-api";
const cents = z.number().int();
export const financeMovementSchema = z.object({ id: z.string().uuid(), kind: z.string(), paymentMethod: z.string(), amountCents: cents, occurredAt: z.string().datetime(), originalMovementId: z.string().nullable(), accountId: z.string().nullable(), note: z.string().nullable(), source: z.string() });
const saleSchema = z.object({ type: z.enum(["order", "counter_sale", "assistant_sale"]), id: z.string().uuid(), totalCents: cents, source: z.string(), description: z.string(), receivedCents: cents, refundedCents: cents, pendingCents: cents, cancelled: z.boolean(), credited: z.boolean(), legacyPaid: z.boolean(), movements: z.array(financeMovementSchema) });
const accountSchema = z.object({ id: z.string().uuid(), name: z.string(), balanceCents: cents });
const titleSchema = z.object({ id: z.string().uuid(), kind: z.enum(["payable", "receivable"]), description: z.string(), category: z.string(), amountCents: cents, settledCents: cents, dueDate: z.string(), status: z.enum(["open", "partial", "settled"]) });
const cardSchema = financeMovementSchema.extend({ dueDate: z.string().nullable(), refundableCents: cents, settled: z.boolean(), netCents: cents.nullable(), feeCents: cents.nullable() });
const flowSchema = z.object({ from: z.string(), to: z.string(), saleReceivableCents: cents, creditReceivableCents: cents, cardReceivableCents: cents, accounts: z.array(accountSchema), movements: z.array(financeMovementSchema), days: z.array(z.object({ date: z.string(), incomingCents: cents, outgoingCents: cents, forecastIncomingCents: cents, forecastOutgoingCents: cents })) });
export type FinanceSale = z.infer<typeof saleSchema>;
export type FinanceAccount = z.infer<typeof accountSchema>;
export type FinanceTitle = z.infer<typeof titleSchema>;
export type FinanceCard = z.infer<typeof cardSchema>;
export type FinanceFlow = z.infer<typeof flowSchema>;
async function get<T>(path: string, schema: z.ZodType<T>) {
  const result = schema.safeParse(await foodApi<unknown>(`/api/v1/food/finance/${path}`));
  if (!result.success) throw new Error("O servidor retornou dados financeiros inválidos. Atualize e tente novamente.");
  return result.data;
}
export const loadFinance = async () => {
  const [sales, accounts, titles, cards, creditReceipts] = await Promise.all([get("sales", z.object({ sales: z.array(saleSchema) })), get("accounts", z.object({ accounts: z.array(accountSchema) })), get("titles", z.object({ titles: z.array(titleSchema) })), get("cards", z.object({ cards: z.array(cardSchema) })), get("credit-receipts", z.object({ creditReceipts: z.array(financeMovementSchema.extend({ customerName: z.string(), availableCents: cents })) }))]);
  return { ...sales, ...accounts, ...titles, ...cards, ...creditReceipts };
};
export const loadFinanceFlow = (from: string, to: string) => get(`flow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, flowSchema);
export async function writeFinance(path: string, data: Record<string, unknown>) {
  const result = z.record(z.unknown()).safeParse(await foodApi<unknown>(`/api/v1/food/finance/${path}`, { method: "POST", body: JSON.stringify(data) }));
  if (!result.success) throw new Error("Resposta financeira inválida. Confira o histórico antes de repetir.");
  return result.data;
}
