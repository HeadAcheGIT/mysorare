/**
 * Player news via Google News' public RSS search feed — no API key, no
 * scraping: RSS is an explicitly supported syndication format, and Google's
 * own feed copyright notice permits "rendering Google News results within a
 * personal feed reader for personal, non-commercial use", which is exactly
 * this app. Only headline, source, date and a link out are kept — never
 * article bodies, which the feed doesn't include anyway (its <description>
 * is just a re-wrapped copy of the link).
 *
 * This replaces manually checking X/Google News per player: fetched lazily,
 * one player at a time, when their popup is opened — never in bulk, since
 * this is a courtesy feed with no documented rate limit to lean on.
 */

export interface NewsItem {
  title: string;
  link: string;
  source: string | null;
  date: string | null;
}

export interface NewsLocale {
  hl: string;
  gl: string;
  ceid: string;
}

/** Default locale — unchanged from before this took a `locale` parameter. */
export const FR_LOCALE: NewsLocale = { hl: "fr", gl: "FR", ceid: "FR:fr" };

/**
 * English locale — queried alongside French by the mercato alert pipeline
 * (see transferStage.ts). Not cosmetic: measured against the live feed, a
 * French-locale query for a player returns almost entirely French outlets
 * (Foot01, Le10Sport, Sports.fr) and the English-locale query for the same
 * player returns a near-disjoint set (ESPN, Sky Sports, Yahoo Sports) — two
 * genuinely independent samples of the same story, not the same results
 * relabelled.
 */
export const EN_LOCALE: NewsLocale = { hl: "en", gl: "US", ceid: "US:en" };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent] ?? m;
  });
}

function tag(item: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item);
  return m ? decodeEntities(m[1].trim()) : null;
}

/** Google's item titles end in " - Source Name"; splitting it out avoids showing the source twice. */
function splitTitle(raw: string): { title: string; source: string | null } {
  const i = raw.lastIndexOf(" - ");
  if (i === -1) return { title: raw, source: null };
  return { title: raw.slice(0, i), source: raw.slice(i + 3) };
}

export async function searchPlayerNews(
  query: string,
  limit = 8,
  locale: NewsLocale = FR_LOCALE
): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; sorare-cockpit/1.0)" } });
  if (!r.ok) throw new Error(`Google News HTTP ${r.status}`);
  const xml = await r.text();

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const parsed = items.slice(0, limit).map((it): NewsItem => {
    const rawTitle = tag(it, "title") ?? "";
    const { title, source } = splitTitle(rawTitle);
    return {
      title,
      link: tag(it, "link") ?? "",
      source,
      date: tag(it, "pubDate"),
    };
  });

  // Google's own ranking mixes relevance and recency; sorting by date here
  // makes "most recent first" a guarantee rather than incidental.
  return parsed
    .filter((n) => n.title && n.link)
    .sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
}
