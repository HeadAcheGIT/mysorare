"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { cardValue, compareNullable, u23SortValue, type SquadCard } from "@/lib/types";
import { matchesSearch, searchTerms } from "@/lib/gallerySearch";
import PlayerCard from "../PlayerCard";
import GalleryFilters, {
  type SortKey,
  type SortDirection,
  type DivisionOption,
  DEFAULT_DIRECTION,
} from "../GalleryFilters";
import GallerySummary from "../GallerySummary";
import CsvImport from "../CsvImport";
import AccountingImport from "../AccountingImport";
import PullToRefresh from "../PullToRefresh";
import { CardListSkeleton } from "../Skeleton";
import type { PlayerAlert } from "../AlertBadges";

interface GalleryTabProps {
  loading: boolean;
  squad: SquadCard[];
  squadLoadFailed: boolean;
  fixture: string | null;
  tokenSignedIn: boolean;
  coveredLeagues: Set<string>;
  alertsBySlug: Record<string, PlayerAlert[]>;
  mercatoRiskBySlug: Record<string, string>;
  onSelectCard: (card: SquadCard) => void;
  refreshAll: () => Promise<void>;
  loadSales: () => Promise<void>;
}

const PAGE_SIZE = 10;

export default function GalleryTab({
  loading,
  squad,
  squadLoadFailed,
  fixture,
  tokenSignedIn,
  coveredLeagues,
  alertsBySlug,
  mercatoRiskBySlug,
  onSelectCard,
  refreshAll,
  loadSales,
}: GalleryTabProps) {
  // Gallery controls
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [direction, setDirection] = useState<SortDirection>(DEFAULT_DIRECTION.score);
  const [inSeasonOnly, setInSeasonOnly] = useState(false);
  const [roiFilter, setRoiFilter] = useState<"" | "gain" | "loss">("");
  const [probableStarterOnly, setProbableStarterOnly] = useState(false);

  const [division, setDivision] = useState("");
  const [divisionOptions, setDivisionOptions] = useState<DivisionOption[]>([]);
  const [eligibleCards, setEligibleCards] = useState<Set<string> | null>(null);
  const [divisionLoading, setDivisionLoading] = useState(false);
  const [divisionNote, setDivisionNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Divisions for eligibility filter
  useEffect(() => {
    if (!fixture || !tokenSignedIn) return;
    let cancelled = false;
    apiFetch<{ tracks: { displayName: string; divisions: { slug: string; displayName: string }[] }[] }>(
      `/api/divisions?fixture=${encodeURIComponent(fixture)}`
    )
      .then((d) => {
        if (cancelled) return;
        const opts: DivisionOption[] = [];
        for (const t of d.tracks) {
          for (const div of t.divisions) {
            opts.push({ slug: div.slug, label: `${t.displayName} · ${div.displayName}` });
          }
        }
        setDivisionOptions(opts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fixture, tokenSignedIn]);

  // Load eligible cards when division filter changes
  useEffect(() => {
    if (!division || !fixture) {
      setEligibleCards(null);
      setDivisionNote(null);
      return;
    }
    let cancelled = false;
    setDivisionLoading(true);
    setDivisionNote(null);
    apiFetch<{ bench: { cardSlug: string | null }[]; canCompose: boolean; canComposeReason: string | null }>(
      `/api/divisions/lineup?fixture=${encodeURIComponent(fixture)}&division=${encodeURIComponent(division)}`
    )
      .then((d) => {
        if (cancelled) return;
        const slugs = new Set<string>();
        for (const b of d.bench) {
          if (b.cardSlug) slugs.add(b.cardSlug);
        }
        setEligibleCards(slugs);
        if (!d.canCompose && d.canComposeReason) setDivisionNote(d.canComposeReason);
      })
      .catch(() => {
        if (!cancelled) setEligibleCards(null);
      })
      .finally(() => {
        if (!cancelled) setDivisionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [division, fixture]);

  const visible = useMemo(() => {
    const terms = searchTerms(search);
    const list = squad.filter((c) => {
      if (position && c.position !== position) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (inSeasonOnly && !c.inSeason) return false;
      if (probableStarterOnly && (c.pStart ?? 0) < 0.5) return false;
      if (roiFilter) {
        const ref = cardValue(c);
        if (ref == null || c.boughtPrice == null) return false;
        const gain = ref - c.boughtPrice >= 0;
        if (roiFilter === "gain" && !gain) return false;
        if (roiFilter === "loss" && gain) return false;
      }
      if (eligibleCards && !eligibleCards.has(c.cardSlug)) return false;
      return matchesSearch(c, terms);
    });

    const score = (c: SquadCard) => c.expected ?? c.sorareProjection ?? c.l10;
    const formAvg = (c: SquadCard) =>
      c.recentScores.length ? c.recentScores.reduce((a, b) => a + b, 0) / c.recentScores.length : null;

    return [...list].sort((a, b) => {
      if (sort === "name") {
        const cmp = a.name.localeCompare(b.name, "fr");
        return direction === "asc" ? cmp : -cmp;
      }
      if (sort === "price") return compareNullable(cardValue(a), cardValue(b), direction);
      if (sort === "form") return compareNullable(formAvg(a), formAvg(b), direction);
      if (sort === "titu") return compareNullable(a.pStart, b.pStart, direction);
      if (sort === "u23") return compareNullable(u23SortValue(a.birthDate), u23SortValue(b.birthDate), direction);
      if (sort === "recent") {
        const at = (c: SquadCard) => (c.acquiredAt ? Date.parse(c.acquiredAt) : null);
        return compareNullable(at(a), at(b), direction);
      }
      return compareNullable(score(a), score(b), direction);
    });
  }, [squad, search, position, rarity, inSeasonOnly, probableStarterOnly, roiFilter, eligibleCards, sort, direction]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visible, currentPage]
  );

  useEffect(() => {
    setPage(1);
  }, [search, position, rarity, inSeasonOnly, probableStarterOnly, roiFilter, division, sort, direction]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <section aria-label="Ma galerie">
        {loading ? (
          <div className="space-y-4">
            <p className="font-mono text-xs text-muted">Chargement de la galerie…</p>
            <CardListSkeleton count={6} />
          </div>
        ) : squad.length === 0 && squadLoadFailed ? (
          <div className="text-center py-6">
            <p className="font-display text-xl uppercase mb-1 text-warn">Galerie indisponible</p>
            <p className="text-sm text-muted">
              Impossible de vérifier tes cartes pour l&apos;instant — voir le message d&apos;erreur ci-dessus.
              Rien n&apos;indique que ta galerie est vide.
            </p>
          </div>
        ) : squad.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-6">
              <p className="font-display text-xl uppercase mb-1">Aucune carte</p>
              <p className="text-sm text-muted">
                Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
              </p>
            </div>
            <CsvImport onDone={refreshAll} />
            <AccountingImport onImported={loadSales} />
          </div>
        ) : (
          <>
            <p className="font-mono text-xs text-muted -mt-1">
              Toute ta galerie — filtre, trie, et repère les alertes prix et mercato sur chaque carte.
            </p>
            <GallerySummary cards={squad} />
            <GalleryFilters
              search={search}
              onSearch={setSearch}
              position={position}
              onPosition={setPosition}
              rarity={rarity}
              onRarity={setRarity}
              sort={sort}
              onSort={setSort}
              direction={direction}
              onDirection={setDirection}
              inSeasonOnly={inSeasonOnly}
              onInSeasonOnly={setInSeasonOnly}
              probableStarterOnly={probableStarterOnly}
              onProbableStarterOnly={setProbableStarterOnly}
              roiFilter={roiFilter}
              onRoiFilter={setRoiFilter}
              divisions={divisionOptions}
              division={division}
              onDivision={setDivision}
              divisionLoading={divisionLoading}
              divisionNote={divisionNote}
            />
            <p className="font-mono text-xs text-muted mb-2">
              {visible.length} carte{visible.length > 1 ? "s" : ""}
              {pageCount > 1 && ` · page ${currentPage}/${pageCount}`}
            </p>
            <ul className="flex flex-col gap-2">
              {paged.map((c) => (
                <PlayerCard
                  key={c.cardSlug}
                  card={c}
                  onSelect={onSelectCard}
                  coveredLeagues={coveredLeagues}
                  alerts={alertsBySlug[c.playerSlug]}
                  mercatoRisk={mercatoRiskBySlug[c.playerSlug]}
                />
              ))}
            </ul>
            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-2 mt-3">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="text-xs border border-line rounded-md px-3 py-2 disabled:opacity-40"
                >
                  ← Précédent
                </button>
                <span className="font-mono text-xs text-muted">
                  {currentPage} / {pageCount}
                </span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount}
                  className="text-xs border border-line rounded-md px-3 py-2 disabled:opacity-40"
                >
                  Suivant →
                </button>
              </div>
            )}
            {visible.length === 0 && (
              <p className="font-mono text-sm text-muted">Aucune carte ne correspond à ce filtre.</p>
            )}
          </>
        )}
      </section>
    </PullToRefresh>
  );
}
