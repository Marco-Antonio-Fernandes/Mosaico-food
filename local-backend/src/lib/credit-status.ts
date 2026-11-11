const WARNING_AFTER_DAYS = 1;
const LATE_AFTER_DAYS = 7;

type CreditHistoryEntry = {
  type: string;
  amountCents: number;
  occurredAt: Date;
};

export function creditStatusOf(entries: CreditHistoryEntry[], now = new Date()) {
  const sorted = [...entries].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const charges: { remainingCents: number; occurredAt: Date }[] = [];
  let lastPaymentAt: Date | null = null;

  for (const entry of sorted) {
    if (entry.type === "charge") {
      if (entry.amountCents > 0) charges.push({ remainingCents: entry.amountCents, occurredAt: entry.occurredAt });
      continue;
    }
    if (entry.type !== "payment" || entry.amountCents <= 0) continue;
    lastPaymentAt = !lastPaymentAt || entry.occurredAt.getTime() > lastPaymentAt.getTime() ? entry.occurredAt : lastPaymentAt;
    let remainingPayment = entry.amountCents;
    while (remainingPayment > 0 && charges.length) {
      const charge = charges[0];
      const applied = Math.min(remainingPayment, charge.remainingCents);
      charge.remainingCents -= applied;
      remainingPayment -= applied;
      if (charge.remainingCents === 0) charges.shift();
    }
  }

  let lateDays = 0;
  for (const charge of charges) {
    const days = Math.max(0, Math.floor((now.getTime() - charge.occurredAt.getTime()) / 86_400_000));
    lateDays = Math.max(lateDays, days);
  }

  return {
    creditStatus: lateDays >= LATE_AFTER_DAYS ? "late" as const : lateDays >= WARNING_AFTER_DAYS ? "warning" as const : "on_time" as const,
    lateDays,
    lastPaymentAt: lastPaymentAt?.toISOString() ?? null,
  };
}
