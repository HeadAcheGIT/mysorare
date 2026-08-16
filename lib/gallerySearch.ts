/**
 * Gallery search.
 *
 * The previous version was `name.includes(q) || club.includes(q)` on the raw
 * strings, which failed on the two things a French-speaking manager types
 * every day: accents ("mbappe" never matched "Mbappé") and more than one word
 * ("lopez marseille" matched nothing, because no single field contains both).
 *
 * So: fold accents and case, split the query into words, and require every
 * word to appear somewhere in the card — name, club, league, position, rarity
 * or season. Words are ANDed because each one a manager adds is meant to
 * narrow, never widen.
 *
 * Pure and free of server imports, so the matching rules are testable on their
 * own rather than only through a rendered list.
 */

/** Lower-cased and stripped of diacritics, so "Mbappé" and "mbappe" are one string. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    // Escaped rather than written as literal combining marks: those are
    // invisible in an editor and one stray copy-paste silently breaks it.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** French labels, so typing "gardien" or "milieu" finds the position. */
const POSITION_WORDS: Record<string, string> = {
  Goalkeeper: "gardien gk goalkeeper",
  Defender: "defenseur def defender",
  Midfielder: "milieu mil midfielder",
  Forward: "attaquant att forward",
};

export interface SearchableCard {
  name: string;
  club?: string | null;
  competitionName?: string | null;
  position?: string;
  rarity?: string;
  season?: number | null;
  inSeason?: boolean;
}

/**
 * Everything about a card that a search word may legitimately match, as one
 * folded string. Built once per card per query rather than per word.
 */
export function searchableText(card: SearchableCard): string {
  return fold(
    [
      card.name,
      card.club ?? "",
      card.competitionName ?? "",
      card.position ?? "",
      POSITION_WORDS[card.position ?? ""] ?? "",
      card.rarity ?? "",
      card.season != null ? String(card.season) : "",
      // Typing "in season" is a real way to ask for it, alongside the toggle.
      card.inSeason ? "in-season inseason" : "",
    ].join(" ")
  );
}

/** Query words, folded. Empty when the query is blank. */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** True when every word of the query appears somewhere in the card. */
export function matchesSearch(card: SearchableCard, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = searchableText(card);
  return terms.every((t) => hay.includes(t));
}
