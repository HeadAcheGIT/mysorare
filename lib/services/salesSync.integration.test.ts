import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../prisma";

// The authenticated Sorare client is mocked: these tests are about what we do
// with the transaction feed, not about Sorare's auth (which needs a real
// session and 2FA — see lib/sorare/auth.ts).
vi.mock("../sorare/client", () => ({
  paginate: vi.fn(),
  graphql: vi.fn(),
}));
vi.mock("./market", () => ({ getPlayerMarket: vi.fn() }));

import { paginate } from "../sorare/client";
import { getPlayerMarket } from "./market";
import { syncSoldOffersFromSorare, listSales } from "./sales";

/** Turns fixture arrays into the async generator `paginate` returns. */
function feed(sold: unknown[], bought: unknown[]) {
  vi.mocked(paginate).mockImplementation(((_q: string, _v: unknown, path: string[]) => {
    const rows = path[1] === "soldSingleSaleTokenOffers" ? sold : bought;
    return (async function* () {
      for (const r of rows) yield r as never;
    })();
  }) as never);
}

const soldOffer = (opts: {
  cardSlug: string;
  playerSlug: string;
  displayName: string;
  eurCents: number;
  date: string;
}) => ({
  transactionDate: opts.date,
  endDate: opts.date,
  senderSide: {
    anyCards: [{ slug: opts.cardSlug, anyPlayer: { slug: opts.playerSlug, displayName: opts.displayName } }],
  },
  receiverSide: { amounts: { eurCents: opts.eurCents, usdCents: null } },
});

async function cleanDb() {
  await prisma.sale.deleteMany();
  await prisma.ethRate.deleteMany();
}

describe("syncSoldOffersFromSorare", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.mocked(getPlayerMarket).mockReset().mockResolvedValue({
      slug: "x",
      name: "x",
      floorByRarity: {},
      listedCount: 0,
    });
  });
  afterAll(cleanDb);

  it("records a confirmed sale with its real price and date", async () => {
    feed(
      [
        soldOffer({
          cardSlug: "kylian-mbappe-2024-limited-7",
          playerSlug: "kylian-mbappe",
          displayName: "Kylian Mbappé",
          eurCents: 12345,
          date: "2026-05-01T12:00:00Z",
        }),
      ],
      []
    );

    const res = await syncSoldOffersFromSorare();
    expect(res.sold).toBe(1);

    const sale = await prisma.sale.findUnique({ where: { cardSlug: "kylian-mbappe-2024-limited-7" } });
    expect(sale?.soldPrice).toBeCloseTo(123.45, 2);
    expect(sale?.source).toBe("sorare_sync");
    expect(sale?.rarity).toBe("limited");
    expect(sale?.season).toBe(2024);
    expect(sale?.serialNumber).toBe(7);
    expect(sale?.soldAt?.toISOString()).toBe("2026-05-01T12:00:00.000Z");
  });

  it("converts an ETH-only offer using that day's rate, and flags the price as approx", async () => {
    // Cached rather than a real CoinGecko call — a past day's rate never
    // changes, so pre-seeding the cache is exactly what a warm cache looks
    // like, and keeps this test offline and deterministic.
    await prisma.ethRate.create({
      data: { date: new Date("2026-05-01T00:00:00.000Z"), eurPerEth: 2000 },
    });

    feed(
      [
        {
          transactionDate: "2026-05-01T12:00:00Z",
          endDate: "2026-05-01T12:00:00Z",
          senderSide: {
            anyCards: [{ slug: "eth-player-2024-rare-3", anyPlayer: { slug: "eth-player", displayName: "Eth Player" } }],
          },
          // 0.05 ETH, no eurCents at all — the exact gap the ETH fallback exists for.
          receiverSide: { amounts: { eurCents: null, usdCents: null, referenceCurrency: "ETH", wei: "50000000000000000" } },
        },
      ],
      []
    );

    const res = await syncSoldOffersFromSorare();
    expect(res.sold).toBe(1);

    const sale = await prisma.sale.findUnique({ where: { cardSlug: "eth-player-2024-rare-3" } });
    expect(sale?.soldPrice).toBeCloseTo(100, 2); // 0.05 ETH * 2000 €/ETH
    expect(sale?.soldPriceApprox).toBe(true);
  });

  it("leaves the price null when neither eurCents nor a wei amount is available", async () => {
    feed(
      [
        {
          transactionDate: "2026-05-01T12:00:00Z",
          endDate: "2026-05-01T12:00:00Z",
          senderSide: {
            anyCards: [{ slug: "no-price-2024-rare-4", anyPlayer: { slug: "no-price", displayName: "No Price" } }],
          },
          receiverSide: { amounts: { eurCents: null, usdCents: null, referenceCurrency: "ETH", wei: null } },
        },
      ],
      []
    );

    await syncSoldOffersFromSorare();

    const sale = await prisma.sale.findUnique({ where: { cardSlug: "no-price-2024-rare-4" } });
    expect(sale?.soldPrice).toBeNull();
    expect(sale?.soldPriceApprox).toBe(false);
  });

  it("upgrades a row the CSV diff had only guessed at, keeping the real price", async () => {
    // What csvImport.ts would have written: no confirmed price, just a valuation.
    await prisma.sale.create({
      data: {
        cardSlug: "kylian-mbappe-2024-limited-7",
        playerSlug: "kylian-mbappe",
        playerName: "Kylian Mbappé",
        rarity: "limited",
        boughtPrice: 95,
        lastKnownPrice: 100,
        source: "csv_diff",
      },
    });

    feed(
      [
        soldOffer({
          cardSlug: "kylian-mbappe-2024-limited-7",
          playerSlug: "kylian-mbappe",
          displayName: "Kylian Mbappé",
          eurCents: 15000,
          date: "2026-05-01T12:00:00Z",
        }),
      ],
      []
    );
    await syncSoldOffersFromSorare();

    const sale = await prisma.sale.findUnique({ where: { cardSlug: "kylian-mbappe-2024-limited-7" } });
    expect(sale?.soldPrice).toBe(150);
    expect(sale?.source).toBe("sorare_sync");
    // The CSV's own record-keeping survives — it's the one thing Sorare can't tell us.
    expect(sale?.boughtPrice).toBe(95);
  });

  it("is idempotent — running twice doesn't duplicate", async () => {
    const offer = soldOffer({
      cardSlug: "a-player-2024-rare-1",
      playerSlug: "a-player",
      displayName: "A Player",
      eurCents: 5000,
      date: "2026-05-01T12:00:00Z",
    });
    feed([offer], []);
    await syncSoldOffersFromSorare();
    await syncSoldOffersFromSorare();

    const rows = await prisma.sale.findMany({ where: { cardSlug: "a-player-2024-rare-1" } });
    expect(rows).toHaveLength(1);
  });

  it("skips an offer whose card slug can't be parsed rather than writing junk", async () => {
    feed(
      [
        soldOffer({
          cardSlug: "not-a-valid-card-slug",
          playerSlug: "whoever",
          displayName: "Whoever",
          eurCents: 5000,
          date: "2026-05-01T12:00:00Z",
        }),
      ],
      []
    );
    const res = await syncSoldOffersFromSorare();
    expect(res.sold).toBe(0);
    expect(await prisma.sale.count()).toBe(0);
  });

  it("backfills boughtPrice from the buy side, without overwriting a known one", async () => {
    await prisma.sale.create({
      data: {
        cardSlug: "gap-2024-limited-1",
        playerSlug: "gap",
        playerName: "Gap",
        rarity: "limited",
        boughtPrice: null,
        source: "csv_diff",
      },
    });
    await prisma.sale.create({
      data: {
        cardSlug: "known-2024-limited-2",
        playerSlug: "known",
        playerName: "Known",
        rarity: "limited",
        boughtPrice: 42,
        source: "csv_diff",
      },
    });

    feed(
      [],
      [
        { senderSide: { anyCards: [{ slug: "gap-2024-limited-1" }] }, receiverSide: { amounts: { eurCents: 7000, usdCents: null } } },
        { senderSide: { anyCards: [{ slug: "known-2024-limited-2" }] }, receiverSide: { amounts: { eurCents: 9900, usdCents: null } } },
      ]
    );
    await syncSoldOffersFromSorare();

    expect((await prisma.sale.findUnique({ where: { cardSlug: "gap-2024-limited-1" } }))?.boughtPrice).toBe(70);
    expect((await prisma.sale.findUnique({ where: { cardSlug: "known-2024-limited-2" } }))?.boughtPrice).toBe(42);
  });

  it("listSales prefers the confirmed sale price over the CSV valuation as its reference", async () => {
    await prisma.sale.create({
      data: {
        cardSlug: "ref-2024-limited-1",
        playerSlug: "ref-player",
        playerName: "Ref Player",
        rarity: "limited",
        lastKnownPrice: 100, // stale CSV guess
        soldPrice: 200, // what it actually went for
        soldAt: new Date("2026-05-01T12:00:00Z"),
        source: "sorare_sync",
      },
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "ref-player",
      name: "Ref Player",
      floorByRarity: { limited: 100 },
      listedCount: 1,
    });

    const [row] = await listSales();
    // vs the real 200 sale price that's -50%, vs the stale 100 guess it'd be 0%.
    expect(row.changePct).toBeCloseTo(-50, 5);
  });
});
