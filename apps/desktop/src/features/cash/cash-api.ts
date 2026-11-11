import { z } from "zod";
import { foodApi } from "@/lib/food-api";

const cents = z.number().int();
const timestamp = z.string().datetime();
const paymentMethod = z.enum(["cash", "pix", "card_credit", "card_debit", "meal_voucher"]);
export const paymentLabels = { cash: "Dinheiro", pix: "Pix", card_credit: "Crédito (a liquidar)", card_debit: "Débito (a liquidar)", meal_voucher: "Vale-alimentação (a liquidar)" } as const;
export const movementLabels = { receipt: "Recebimento", supply: "Suprimento", withdrawal: "Sangria", expense: "Despesa", refund: "Estorno", settlement: "Liquidação", transfer_in: "Transferência recebida", transfer_out: "Transferência enviada" } as const;
const totalsSchema = z.object({ cash: cents, pix: cents, card_credit: cents, card_debit: cents, meal_voucher: cents, crediario: cents });
const sessionSchema = z.object({
  id: z.string().uuid(), businessDate: z.string(), status: z.enum(["open", "closed"]), openingCashCents: cents,
  expectedCashCents: cents.nullable(), countedCashCents: cents.nullable(), differenceCents: cents.nullable(),
  openedAt: timestamp, openingRecordedAt: timestamp.nullable(), closedAt: timestamp.nullable(), notes: z.string().nullable(),
});
const movementSchema = z.object({
  id: z.string().uuid(), referenceType: z.string(), referenceId: z.string(), source: z.string(),
  kind: z.enum(["receipt", "supply", "withdrawal", "expense", "refund", "settlement", "transfer_in", "transfer_out"]), paymentMethod, amountCents: cents.nonnegative(),
  note: z.string().nullable(), occurredAt: timestamp,
});
const snapshotSchema = z.object({
  session: sessionSchema.nullable(), expectedCashCents: cents, totals: totalsSchema,
  cashBreakdown: z.object({ openingCashCents: cents, receiptsCents: cents, suppliesCents: cents, withdrawalsCents: cents, expensesCents: cents, refundsCents: cents }),
  movements: z.array(movementSchema), movementCount: z.number().int().nonnegative(), legacySaleCount: z.number().int().nonnegative(),
  unassigned: z.object({ date: z.string(), totals: totalsSchema, movements: z.array(movementSchema), movementCount: z.number().int().nonnegative() }).optional(),
});
export type CashSnapshot = z.infer<typeof snapshotSchema>;
export type CashSession = z.infer<typeof sessionSchema>;
export type CashMovement = z.infer<typeof movementSchema>;
export type CashMovementKind = "supply" | "withdrawal" | "expense";

function validate<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("O servidor retornou dados de caixa inválidos. Atualize o aplicativo e tente novamente.");
  return result.data;
}
export async function getCashSnapshot(id?: string) {
  return validate(snapshotSchema, await foodApi<unknown>(`/api/v1/food/cash/${id ? encodeURIComponent(id) : "today"}`));
}
export async function getCashHistory() {
  return validate(z.object({ sessions: z.array(sessionSchema) }), await foodApi<unknown>("/api/v1/food/cash/history")).sessions;
}
export async function openCash(openingCashCents: number) {
  return validate(snapshotSchema, await foodApi<unknown>("/api/v1/food/cash/open", { method: "POST", body: JSON.stringify({ openingCashCents }) }));
}
export async function registerCashMovement(input: { operationId: string; kind: CashMovementKind; amountCents: number; note: string }) {
  return validate(z.object({ movement: movementSchema }), await foodApi<unknown>("/api/v1/food/cash/movements", { method: "POST", body: JSON.stringify(input) }));
}
export async function closeCash(input: { sessionId: string; countedCashCents: number; expectedCashCents: number; notes: string }) {
  return validate(snapshotSchema, await foodApi<unknown>("/api/v1/food/cash/close", { method: "POST", body: JSON.stringify(input) }));
}
export const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function maskCashAmount(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (digits.length > 15) return digits;
  return digits ? (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}
export function parseCashAmount(value: string) {
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(value)) return null;
  const result = Number(value.replace(/[.,]/g, ""));
  return Number.isSafeInteger(result) && result <= 100_000_000 ? result : null;
}
