import { describe, it, expect } from "vitest";
import { classifyHeadline, summarizeTransferSignal, TRANSFER_STAGES } from "./transferStage";

const item = (title: string, overrides: Partial<{ link: string; source: string | null; date: string | null }> = {}) => ({
  title,
  link: overrides.link ?? "https://example.com/a",
  source: overrides.source ?? "Some Outlet",
  date: overrides.date ?? new Date().toISOString(),
});

describe("classifyHeadline", () => {
  it("reads French contact/interest vocabulary", () => {
    expect(classifyHeadline("Le PSG dans le viseur pour un jeune attaquant")).toBe("contact");
  });

  it("reads English negotiation vocabulary", () => {
    expect(classifyHeadline("Player X in talks to leave the club")).toBe("negotiation");
  });

  it("reads French agreement vocabulary", () => {
    expect(classifyHeadline("Accord trouvé entre les deux clubs")).toBe("agreement");
  });

  it("reads medical-exam vocabulary in both languages", () => {
    expect(classifyHeadline("Il passe sa visite médicale ce matin")).toBe("medical");
    expect(classifyHeadline("Player undergoes his medical today")).toBe("medical");
  });

  it("reads official/completed vocabulary", () => {
    expect(classifyHeadline("Officiel : il s'engage avec le club pour 4 ans")).toBe("official");
    expect(classifyHeadline("Club completes the signing of Player X")).toBe("official");
  });

  it("picks the strongest stage when a headline matches more than one", () => {
    // Mentions both "négociations" and "officiel" — the strongest wins.
    expect(classifyHeadline("Après des négociations, le transfert est enfin officiel")).toBe("official");
  });

  it("returns null for a headline with no transfer vocabulary at all", () => {
    expect(classifyHeadline("Il inscrit un but splendide en fin de match")).toBeNull();
  });

  it("returns null on an explicit denial rather than a false positive", () => {
    expect(classifyHeadline("Le club dément tout accord avec le joueur")).toBeNull();
    expect(classifyHeadline("Not yet official, says the club president")).toBeNull();
  });

  it("returns null for an empty title", () => {
    expect(classifyHeadline("")).toBeNull();
  });
});

describe("summarizeTransferSignal", () => {
  it("returns null when nothing is transfer-flavoured", () => {
    expect(summarizeTransferSignal([item("Il inscrit un doublé ce week-end")])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(summarizeTransferSignal([])).toBeNull();
  });

  it("picks the highest stage reached across all headlines", () => {
    const out = summarizeTransferSignal([
      item("Dans le viseur du club depuis des mois", { source: "Foot01" }),
      item("Accord trouvé entre les deux clubs", { source: "L'Équipe" }),
      item("En négociations avancées", { source: "RMC Sport" }),
    ]);
    expect(out?.stage).toBe("agreement");
  });

  it("counts distinct outlets at the top stage as the corroboration signal", () => {
    const out = summarizeTransferSignal([
      item("Accord trouvé entre les deux clubs", { source: "L'Équipe", link: "https://a" }),
      item("Deal agreed between the two clubs", { source: "Sky Sports", link: "https://b" }),
      item("Verbal agreement reached, sources say", { source: "ESPN", link: "https://c" }),
    ]);
    expect(out?.sources.sort()).toEqual(["ESPN", "L'Équipe", "Sky Sports"]);
  });

  it("does not double-count the same outlet reported with different casing", () => {
    const out = summarizeTransferSignal([
      item("Accord trouvé entre les deux clubs", { source: "ESPN", link: "https://a" }),
      item("Deal now agreed, ESPN reports", { source: "espn", link: "https://b" }),
    ]);
    expect(out?.sources).toEqual(["ESPN"]);
  });

  it("ignores a headline older than the recency window", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const out = summarizeTransferSignal([item("Officiel : transfert conclu", { date: old })]);
    expect(out).toBeNull();
  });

  it("keeps a headline with no date rather than discarding it over a missing timestamp", () => {
    const out = summarizeTransferSignal([item("Accord trouvé entre les deux clubs", { date: null })]);
    expect(out?.stage).toBe("agreement");
  });

  it("returns the most recent headline at the top stage as the link-out", () => {
    const older = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const newer = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const out = summarizeTransferSignal([
      item("Accord trouvé (source A)", { date: older, link: "https://old" }),
      item("Accord total trouvé (source B)", { date: newer, link: "https://new" }),
    ]);
    expect(out?.headline.link).toBe("https://new");
  });

  it("an explicit denial contributes nothing, even alongside real signal", () => {
    const out = summarizeTransferSignal([
      item("En négociations avancées", { source: "RMC Sport" }),
      item("Le club dément tout accord", { source: "Random Blog" }),
    ]);
    expect(out?.stage).toBe("negotiation");
    expect(out?.sources).toEqual(["RMC Sport"]);
  });
});

describe("TRANSFER_STAGES", () => {
  it("is ordered weakest to strongest by rank", () => {
    const ranks = TRANSFER_STAGES.map((s) => s.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

/**
 * Real headlines pulled from Google News during development (Ousmane
 * Dembélé, August 2026 — see the module doc's comment on French/English
 * queries returning disjoint outlets). Regression fixtures: crafted test
 * cases pass by construction, these catch phrasing the crafted ones don't
 * happen to cover.
 */
describe("classifyHeadline on real captured headlines", () => {
  it.each([
    ["PSG: Ousmane Dembélé, une offre folle venue d'Arabie Saoudite !", "contact"],
    ["Le PSG entre en contact avec un brésilien pour remplacer Ousmane Dembélé", "contact"],
    ["PSG : Dembélé à Al-Hilal, négociations en cours", "negotiation"],
    ["Ousmane Dembele in talks to leave Paris Saint-Germain: report", "negotiation"],
    ["Al Hilal open talks to sign Ousmane Dembélé from PSG", "negotiation"],
    [
      "Shock as Premier League transfer move 'could be on the cards' for PSG star Ousmane Dembele",
      "contact",
    ],
  ])("%s -> %s", (title, expected) => {
    expect(classifyHeadline(title)).toBe(expected);
  });

  it("a pure form/results headline with no transfer angle stays null", () => {
    expect(
      classifyHeadline("Mondial 2026 : Ousmane Dembélé a réussi sa mue pour se hisser au sommet de son art")
    ).toBeNull();
  });
});
