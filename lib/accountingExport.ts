import type { PriceComposition } from "./accountingRoi";

export interface SaleExportRow {
  cardSlug: string;
  playerName: string;
  rarity: string;
  season: number | null;
  serialNumber: number | null;
  boughtPrice: number | null;
  soldPrice: number | null;
  soldAt: string | null;
  detectedAt: string;
  source: string;
}

/**
 * Formats sales and accounting ledger reconciliation into an RFC 4180 CSV
 * with UTF-8 BOM, ready for Excel and tax/accounting tracking.
 */
export function generateSalesCsv(
  sales: SaleExportRow[],
  compositions: Record<string, PriceComposition> = {}
): string {
  const headers = [
    "Date de vente",
    "Joueur",
    "Rareté",
    "Saison",
    "Numéro",
    "Prix d'achat (€)",
    "Prix de vente (€)",
    "Plus/Moins-value (€)",
    "Dont cash portefeuille (€)",
    "Dont crédits (€)",
    "Part de crédits (%)",
    "Source",
    "Identifiant carte",
  ];

  const rows = sales.map((s) => {
    const when = s.soldAt ? s.soldAt.slice(0, 10) : s.detectedAt.slice(0, 10);
    const bought = s.boughtPrice != null ? s.boughtPrice.toFixed(2) : "";
    const sold = s.soldPrice != null ? s.soldPrice.toFixed(2) : "";
    const profit =
      s.soldPrice != null && s.boughtPrice != null
        ? (s.soldPrice - s.boughtPrice).toFixed(2)
        : "";

    const comp = compositions[s.cardSlug];
    const wallet = comp ? comp.wallet.toFixed(2) : "";
    const credit = comp ? comp.credit.toFixed(2) : "";
    const creditPct = comp && comp.creditPct > 0 ? `${comp.creditPct}%` : "";
    const sourceLabel = s.source === "sorare_sync" ? "Sorare (confirmé)" : "Estimation CSV";

    const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;

    return [
      escape(when),
      escape(s.playerName),
      escape(s.rarity),
      s.season != null ? String(s.season) : "",
      s.serialNumber != null ? String(s.serialNumber) : "",
      bought,
      sold,
      profit,
      wallet,
      credit,
      creditPct,
      escape(sourceLabel),
      escape(s.cardSlug),
    ].join(";");
  });

  // \uFEFF for UTF-8 Excel BOM
  return "\uFEFF" + [headers.map((h) => `"${h}"`).join(";"), ...rows].join("\r\n");
}
