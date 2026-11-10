const LATE_AFTER_DAYS = 30;

type CreditHistoryEntry = {
  type: string;
  amountCents: number;
  occurredAt: Date;
};

export function creditStatusOf(entries: CreditHistoryEntry[], now = new Date()) {
  const sorted = [...entries].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const charges: { remainingCents: number; occurredAt: Date }[] = [];
  let lateDays = 0;
  let lastPaymentAt: Date | null = null;

  const markDelay = (chargeDate: Date, paymentDate: Date) => {
    const days = Math.floor((paymentDate.getTime() - chargeDate.getTime()) / 86_400_000);
    if (days > LATE_AFTER_DAYS) lateDays = Math.max(lateDays, days);
  };

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
      markDelay(charge.occurredAt, entry.occurredAt);
      if (charge.remainingCents === 0) charges.shift();
    }
  }

  for (const charge of charges) {
    const days = Math.floor((now.getTime() - charge.occurredAt.getTime()) / 86_400_000);
    if (days > LATE_AFTER_DAYS) lateDays = Math.max(lateDays, days);
  }

  return {
    creditStatus: lateDays > 0 ? "late" as const : "on_time" as const,
    lateDays,
    lastPaymentAt: lastPaymentAt?.toISOString() ?? null,
  };
}
