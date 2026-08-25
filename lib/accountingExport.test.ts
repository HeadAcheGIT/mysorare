import { describe, it, expect } from "vitest";
import { generateSalesCsv, type SaleExportRow } from "./accountingExport";

describe("generateSalesCsv", () => {
  it("formats sales with RFC 4180 CSV, BOM and credit decomposition", () => {
    const sales: SaleExportRow[] = [
      {
        cardSlug: "kylian-mbappe-2024-limited-12",
        playerName: "Kylian Mbappé",
        rarity: "limited",
        season: 2024,
        serialNumber: 12,
        boughtPrice: 50.0,
        soldPrice: 75.5,
        soldAt: "2026-05-10T14:30:00.000Z",
        detectedAt: "2026-05-10T14:30:00.000Z",
        source: "sorare_sync",
      },
      {
        cardSlug: "maxime-lopez-2023-limited-45",
        playerName: "Maxime Lopez",
        rarity: "limited",
        season: 2023,
        serialNumber: 45,
        boughtPrice: 4.87,
        soldPrice: null,
        soldAt: null,
        detectedAt: "2026-06-01T08:00:00.000Z",
        source: "csv_diff",
      },
    ];

    const compositions = {
      "kylian-mbappe-2024-limited-12": {
        price: 50.0,
        wallet: 30.0,
        credit: 20.0,
        creditPct: 40,
      },
    };


    const csv = generateSalesCsv(sales, compositions);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Date de vente";"Joueur";"Rareté"');
    expect(csv).toContain('"2026-05-10";"Kylian Mbappé";"limited";2024;12;50.00;75.50;25.50;30.00;20.00;40%;"Sorare (confirmé)";"kylian-mbappe-2024-limited-12"');
    expect(csv).toContain('"2026-06-01";"Maxime Lopez";"limited";2023;45;4.87;;;;;;"Estimation CSV";"maxime-lopez-2023-limited-45"');
  });

  it("handles empty sales list cleanly", () => {
    const csv = generateSalesCsv([]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Date de vente"');
  });
});
