"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { matchesSearch, searchTerms } from "@/lib/gallerySearch";
import { POSITION_SHORT, type SquadCard } from "@/lib/types";
import type { PlayerSearchResult } from "@/lib/services/market";

/**
 * Search from anywhere in the app, not just the Galerie tab.
 *
 * Galerie already had a search box (lib/gallerySearch.ts), but it only
 * existed inside that one tab — finding a player while looking at Semaine or
 * Mercato meant switching tabs first, losing whatever filter was set there.
 * This reuses the exact same matching rules against the squad already held
 * in memory (instant, no request), and layers on the public player-search API
 * for names not in the gallery, so "should I buy this guy" doesn't require
 * leaving to the Marché tab first.
 */
export default function GlobalSearch({
  squad,
  onSelectPlayer,
  onOpenGallery,
  onClose,
}: {
  squad: SquadCard[];
  onSelectPlayer: (slug: string) => void;
  onOpenGallery: (query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [marketResults, setMarketResults] = useState<PlayerSearchResult[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const ownedMatches = useMemo(() => {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const seen = new Set<string>();
    const out: SquadCard[] = [];
    // One row per player, not per card: a manager with five Mbappé copies
    // doesn't need to see the same name five times in a quick-search list.
    for (const c of squad) {
      if (seen.has(c.playerSlug) || !matchesSearch(c, terms)) continue;
      seen.add(c.playerSlug);
      out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  }, [squad, query]);

  // Debounced: the public API call shouldn't fire on every keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMarketResults([]);
      setMarketLoading(false);
      return;
    }
    setMarketLoading(true);
    const timer = setTimeout(() => {
      apiFetch<PlayerSearchResult[]>(`/api/market/search?q=${encodeURIComponent(q)}`)
        .then((results) => setMarketResults(results))
        .catch(() => setMarketResults([]))
        .finally(() => setMarketLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const ownedSlugs = useMemo(() => new Set(squad.map((c) => c.playerSlug)), [squad]);
  // A player already shown under "Ta galerie" doesn't need a second, thinner
  // row from the market search below it.
  const marketOnly = marketResults.filter((p) => !ownedSlugs.has(p.slug));

  const trimmed = query.trim();
  const hasResults = ownedMatches.length > 0 || marketOnly.length > 0;

  function pick(slug: string) {
    onSelectPlayer(slug);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        className="relative w-full sm:max-w-md sm:mt-16 bg-ink2 border-b sm:border border-line sm:rounded-xl max-h-[90vh] sm:max-h-[75vh] flex flex-col safe-top"
      >
        <div className="flex items-center gap-2 p-3 border-b border-line shrink-0">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) onOpenGallery(trimmed);
            }}
            placeholder="Joueur, club, poste, championnat…"
            aria-label="Rechercher un joueur"
            className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={onClose}
            aria-label="Fermer la recherche"
            className="shrink-0 w-9 h-9 grid place-items-center rounded-md border border-line text-muted"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto">
          {!trimmed ? (
            <p className="p-4 font-mono text-xs text-muted">
              Cherche un nom, un club, un poste ou un championnat — d&apos;abord dans ta galerie, puis sur le
              marché.
            </p>
          ) : (
            <>
              {ownedMatches.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wide text-muted">
                    Ta galerie
                  </p>
                  <ul>
                    {ownedMatches.map((c) => (
                      <li key={c.playerSlug}>
                        <button
                          type="button"
                          onClick={() => pick(c.playerSlug)}
                          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-ink"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold truncate">{c.name}</span>
                            <span className="block text-xs text-muted truncate">
                              {c.club ?? "sans club"}
                              {c.competitionName ? ` · ${c.competitionName}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] uppercase text-muted border border-line rounded px-1.5 py-0.5">
                            {POSITION_SHORT[c.position] ?? c.position}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(marketOnly.length > 0 || marketLoading) && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wide text-muted">
                    Sur le marché
                  </p>
                  {marketLoading && marketOnly.length === 0 ? (
                    <p className="px-4 py-2 font-mono text-xs text-muted">Recherche…</p>
                  ) : (
                    <ul>
                      {marketOnly.map((p) => (
                        <li key={p.slug}>
                          <button
                            type="button"
                            onClick={() => pick(p.slug)}
                            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-ink"
                          >
                            <span className="min-w-0">
                              <span className="block font-bold truncate">{p.name}</span>
                              <span className="block text-xs text-muted truncate">
                                {p.club ?? "sans club"}
                                {p.competitionName ? ` · ${p.competitionName}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase text-muted border border-line rounded px-1.5 py-0.5">
                              {POSITION_SHORT[p.position] ?? p.position}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!hasResults && !marketLoading && (
                <p className="p-4 font-mono text-xs text-muted">Aucun résultat pour « {trimmed} ».</p>
              )}

              {ownedMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenGallery(trimmed)}
                  className="w-full text-center text-xs text-muted border-t border-line py-2.5 hover:text-fg"
                >
                  Voir tout dans la Galerie ↓
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
