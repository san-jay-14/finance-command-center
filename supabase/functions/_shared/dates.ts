export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function advanceDate(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  if (frequency === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
