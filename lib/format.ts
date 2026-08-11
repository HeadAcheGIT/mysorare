/** Shared display formatting for client components. */

export function relativeDate(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days === -1) return "demain";
  if (days > 1) return `il y a ${days} j`;
  return `dans ${-days} j`;
}

export type Money = { amount: number; currency: string } | null;

export const formatMoney = (m: Money) => (m == null ? "—" : `${m.amount.toFixed(2)} ${m.currency === "USD" ? "$" : "€"}`);
