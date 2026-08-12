import { prisma } from "../prisma";

/**
 * Historical ETH→EUR rate, for the one case Sorare's own transaction record
 * doesn't give us a EUR figure to trust: an old sale denominated in wei with
 * no eurCents alongside it (see resolveSaleAmount in sales.ts). Rather than
 * pricing it at *today's* ETH rate — which would make old and recent sales
 * incomparable in the Historique recap — this looks up the real rate on the
 * sale's own day from CoinGecko's free, no-key historical-price endpoint.
 */

const COINGECKO_HISTORY_URL = "https://api.coingecko.com/api/v3/coins/ethereum/history";

function dayKey(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toCoinGeckoDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/**
 * EUR value of 1 ETH on the given calendar day (UTC). Cached in EthRate
 * since a past day's rate never changes — keeps repeated Historique loads
 * from re-hitting CoinGecko's free-tier rate limit for the same dates.
 * Returns null on any failure rather than guessing.
 */
export async function getEthEurRate(at: Date): Promise<number | null> {
  const day = dayKey(at);

  const cached = await prisma.ethRate.findUnique({ where: { date: day } });
  if (cached) return cached.eurPerEth;

  try {
    const res = await fetch(`${COINGECKO_HISTORY_URL}?date=${toCoinGeckoDate(day)}&localization=false`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.market_data?.current_price?.eur;
    if (typeof rate !== "number") return null;

    await prisma.ethRate.upsert({
      where: { date: day },
      create: { date: day, eurPerEth: rate },
      update: { eurPerEth: rate },
    });
    return rate;
  } catch {
    return null;
  }
}

/** Parses a WeiAmount (numeric string) into a plain ETH float. Null on anything unparsable. */
export function weiToEth(wei: string | null | undefined): number | null {
  if (!wei) return null;
  try {
    const asWei = BigInt(wei);
    return Number(asWei) / 1e18;
  } catch {
    return null;
  }
}
