/**
 * Classifies transfer-window headlines into a five-stage pipeline, and
 * requires more than one independent outlet before a stage counts as
 * corroborated.
 *
 * X's own API is the direct way to read the source transfer reporters
 * actually break news on, but it's paid (search access starts around
 * $200/month) and this app has no such key configured. Absent that, the
 * honest alternative is what this module does: aggregate Google News across
 * two languages (see checkTransferAlert in alerts.ts, which queries both
 * "<name> transfert" in French and "<name> transfer" in English — measured
 * against the live feed, these return almost entirely disjoint outlet sets,
 * e.g. Foot01/Le10Sport/Sports.fr on the French side against
 * ESPN/Sky Sports/Yahoo Sports on the English one), classify every headline
 * independently, and count how many *distinct* outlets land on the same
 * stage. One blog claiming a done deal is a rumour; three unrelated outlets
 * saying so within a few days is corroboration. Never a substitute for
 * clicking through and reading — every alert carries the link it came from.
 *
 * Pure and free of server imports so the classification rules are testable
 * without a network call.
 */

export type TransferStageId = "contact" | "negotiation" | "agreement" | "medical" | "official";

export interface TransferStageMeta {
  id: TransferStageId;
  /** 1 = weakest signal, 5 = strongest. */
  rank: number;
  label: string;
  icon: string;
  /**
   * Escalation, not good/bad-for-you — same principle the old single
   * "transfer_rumor" badge used: this says how far along the story is, not
   * whether it favours this card. `muted`/`flood` are "still moving, keep an
   * eye on it"; `warn` is "close to done, go decide something now" — the
   * same weight `warn` already carries for an injury elsewhere in the app.
   */
  tone: "muted" | "flood" | "warn";
  /** Zero server imports in this module — safe to import from client components too. */
}

/** Weakest first — the order a real transfer saga usually (not always) moves through. */
export const TRANSFER_STAGES: TransferStageMeta[] = [
  { id: "contact", rank: 1, label: "Intérêt", icon: "👀", tone: "muted" },
  { id: "negotiation", rank: 2, label: "Négociations", icon: "🗣️", tone: "flood" },
  { id: "agreement", rank: 3, label: "Accord trouvé", icon: "🤝", tone: "flood" },
  { id: "medical", rank: 4, label: "Visite médicale", icon: "🏥", tone: "warn" },
  { id: "official", rank: 5, label: "Officialisé", icon: "✅", tone: "warn" },
];

const STAGE_RANK = new Map(TRANSFER_STAGES.map((s) => [s.id, s.rank]));

/**
 * Word boundary, but one that actually works on French: JS's `\b` is defined
 * over ASCII `\w` only, so it misfires around accented letters — `\btrouvé\b`
 * fails to match "trouvé" at all, because the position right after 'é' isn't
 * a "boundary" by that ASCII definition, and every keyword below has an
 * accented word at a boundary somewhere. `\p{L}` (needs the `u` flag) is
 * Unicode-aware, so this lookaround pair does what `\b` was supposed to.
 */
const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";

/**
 * A headline that mentions the vocabulary below but explicitly denies it —
 * "pas encore officiel", "PSG denies Dembélé exit talks" — must not read as
 * a positive signal. Checked before any stage match; a hit here means the
 * headline contributes nothing rather than being misclassified as good news.
 */
const NEGATION = new RegExp(
  `${B}(?:pas encore|n'est pas|d[ée]ment(?:i|is)?|denies?|denial|not yet|no truth|rumeur infond[ée]e|d[ée]menti|dans le faux|is not (?:in )?(?:talks|negotiat))${E}`,
  "iu"
);

/**
 * One pattern per stage, strongest first — a headline is classified by the
 * *strongest* stage it matches, since a surprise done-deal headline mentions
 * "officiel" without ever having visibly gone through "négociations" in the
 * public record. Bilingual (French + English) because both locales are
 * queried; each list is deliberately narrow rather than exhaustive, since a
 * false positive here (reading routine transfer chatter as a confirmed
 * signing) is the one mistake this whole feature exists to avoid.
 */
const KEYWORDS: Record<TransferStageId, RegExp> = {
  official: new RegExp(
    `${B}(?:officiel(?:lement)?|s'engage (?:avec|pour|jusqu)|rejoint officiellement|paraph[ée]|conclut son transfert|transfert confirm[ée]|a sign[ée] (?:avec|pour|à|au)|sign(?:s|ed)? (?:for|with)|have signed|completes? (?:his |her |the |a )?(?:move|transfer|signing)|confirm(?:s|ed) (?:the )?transfer|welcome to|unveiled as|here we go)${E}`,
    "iu"
  ),
  medical: new RegExp(
    `${B}(?:visite m[ée]dicale|passe sa visite|aux mains des m[ée]decins|undergoes? (?:a |his |her )?medical|medical (?:scheduled|completed|booked|underway))${E}`,
    "iu"
  ),
  agreement: new RegExp(
    `${B}(?:accord (?:trouv[ée]|de principe|total)|proche d'un accord|(?:club|clubs) s'entendent|deal agreed|agreement reached|verbal agreement|agreed terms|close to a deal|terms agreed)${E}`,
    "iu"
  ),
  negotiation: new RegExp(
    `${B}(?:n[ée]gociations?|n[ée]gocie(?:nt)? (?:avec|pour)|pourparlers|discussions? avanc[ée]es?|en discussion avec|in(?: advanced)? talks|negotiat(?:ing|ions)|opens? talks)${E}`,
    "iu"
  ),
  // Deliberately the widest net of the five: this is the "worth a look,
  // nothing confirmed" tier, so a false positive here just shows a
  // low-severity badge rather than a wrong claim about how far a deal has
  // gone — unlike the tiers above, where a false positive would be a real
  // reliability failure. Broadened after testing against real captured
  // headlines: "offre" and "entre en contact" are ordinary mercato reporting
  // that the original, narrower list missed entirely (see the module's test
  // file for the fixtures that caught this).
  contact: new RegExp(
    `${B}(?:int[ée]ress[ée]e? par|dans le viseur|aurait coch[ée]|sur les tablettes|convoit[ée]e?|cible priorita|entre en contact|offre (?:folle|colossale|xxl)?|piste (?:s[ée]rieuse|chaude)?|dossier (?:chaud|br[ûu]lant)?|rumeur|mercato|link(?:ed)? (?:with|to)|eyeing|eyes (?:a )?(?:move|exit)|keeping tabs on|on the radar|shortlisted|monitoring (?:the situation|his situation)|on the cards|transfer rumor|transfer move)${E}`,
    "iu"
  ),
};

/** Strongest first, so classifyHeadline keeps the highest stage a headline matches. */
const STAGE_STRENGTH_ORDER: TransferStageId[] = ["official", "medical", "agreement", "negotiation", "contact"];

/** The strongest stage one headline's title matches, or null if it isn't transfer-flavoured at all. */
export function classifyHeadline(title: string): TransferStageId | null {
  if (!title || NEGATION.test(title)) return null;
  for (const id of STAGE_STRENGTH_ORDER) {
    if (KEYWORDS[id].test(title)) return id;
  }
  return null;
}

export interface NewsLikeItem {
  title: string;
  link: string;
  source: string | null;
  date: string | null;
}

export interface TransferSignal {
  stage: TransferStageId;
  /** Distinct outlet names backing the top stage — see the module doc for why this is the reliability signal. */
  sources: string[];
  /** The most recent headline at that stage, for the alert to link out to. */
  headline: { title: string; link: string; date: string | null };
}

/** Headlines older than this no longer speak to a *live* transfer situation. */
const RECENCY_WINDOW_DAYS = 21;

/**
 * Reduces a set of headlines (already merged across languages/queries) to
 * the single strongest, most-recent transfer signal, or null if nothing
 * transfer-flavoured and recent enough was found — which is exactly the
 * "clear the alert" case in alerts.ts.
 */
export function summarizeTransferSignal(items: NewsLikeItem[], now: Date = new Date()): TransferSignal | null {
  const cutoff = now.getTime() - RECENCY_WINDOW_DAYS * 86_400_000;

  const staged = items
    .filter((it) => it.title && it.link)
    .filter((it) => {
      const t = it.date ? Date.parse(it.date) : NaN;
      // No date at all is kept rather than dropped — Google's feed omits it
      // occasionally, and discarding an otherwise-valid headline over a
      // missing timestamp would throw away a real signal for no reason.
      return !Number.isFinite(t) || t >= cutoff;
    })
    .map((it) => ({ ...it, stage: classifyHeadline(it.title) }))
    .filter((it): it is NewsLikeItem & { stage: TransferStageId } => it.stage != null);

  if (!staged.length) return null;

  const bestRank = Math.max(...staged.map((s) => STAGE_RANK.get(s.stage)!));
  const bestId = TRANSFER_STAGES.find((s) => s.rank === bestRank)!.id;
  const atBest = staged.filter((s) => s.stage === bestId);

  // Distinct outlets, case-insensitive — "ESPN" and "espn" are the same
  // source and must not double-count toward corroboration.
  const seen = new Map<string, string>();
  for (const s of atBest) {
    if (!s.source) continue;
    const key = s.source.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, s.source.trim());
  }

  const newest = [...atBest].sort(
    (a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0)
  )[0];

  return {
    stage: bestId,
    sources: [...seen.values()],
    headline: { title: newest.title, link: newest.link, date: newest.date },
  };
}
