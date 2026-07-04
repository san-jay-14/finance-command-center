// Simplification: assumes no price appreciation on the holding itself — just
// principal accumulation from future contributions layered on top of
// today's current value. Modeling real price growth is a later refinement.

export function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "daily":
      return amount * 30; // approx days/month
    case "weekly":
      return amount * (52 / 12);
    case "monthly":
    default:
      return amount;
  }
}

export function projectTwelveMonths(currentValue: number, amount: number, frequency: string): number {
  return currentValue + monthlyEquivalent(amount, frequency) * 12;
}
