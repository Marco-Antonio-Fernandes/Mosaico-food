import type { Prisma } from "@prisma/client";

export function businessDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

/**
 * Garante uma sessão por dia sem exigir uma ação de abertura do operador.
 * Sessões esquecidas de dias anteriores são encerradas sem conferência:
 * o valor esperado continua sendo calculado pelo livro-caixa quando
 * o histórico for consultado.
 */
export async function ensureDailyCashSession(tx: Prisma.TransactionClient, date = new Date(), openingCashCents = 0) {
  const today = businessDate(date);
  const staleSessions = await tx.foodCashSession.findMany({ where: { status: "open", businessDate: { not: today } }, select: { id: true } });
  for (const stale of staleSessions) {
    await tx.foodCashSession.updateMany({
      where: { id: stale.id, status: "open" },
      data: {
        status: "closed",
        activeKey: null,
        expectedCashCents: null,
        countedCashCents: null,
        differenceCents: null,
        notes: null,
        closedAt: date,
      },
    });
  }

  const existing = await tx.foodCashSession.findUnique({ where: { businessDate: today } });
  if (existing) return existing;

  return tx.foodCashSession.create({
    data: { businessDate: today, activeKey: "active", openingCashCents },
  });
}
