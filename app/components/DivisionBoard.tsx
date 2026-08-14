"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT } from "@/lib/types";

type FixtureRow = {
  slug: string;
  displayName: string | null;
  gameWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  cutOffDate: string | null;
};

type ComparisonRow = {
  playerSlug: string;
  playerName: string;
  picture: string | null;
  cardSlug: string;
  captain: boolean;
  position: string | null;
  ourPStart: number | null;
  sorareStarterOdds: number | null;
  sorareOddsProviderIconUrl: string | null;
  actualScore: number | null;
  actualStarted: boolean | null;
  disagreement: number | null;
};

type EligibilityRow = {
  position: string;
  seasonality: string | null;
  totalCount: number;
  usedCardsCount: number;
  available: number;
};

type DivisionView = {
  slug: string;
  displayName: string;
  division: number | null;
  rarityType: string | null;
  seasonality: string | null;
  cutOffDate: string | null;
  canCompose: boolean;
  canComposeReason: string | null;
  missingCards: number;
  missingPositions: string[];
  missingRarities: string[];
  notEnoughEligibleCards: boolean;
  prizePool: number | null;
  prizePoolCurrency: string | null;
  divisionIconUrl: string | null;
  eligibility: EligibilityRow[];
  lineup: ComparisonRow[];
  hasLineup: boolean;
};

type TrackView = {
  slug: string;
  displayName: string;
  seasonality: string | null;
  seasonalityName: string | null;
  iconUrl: string | null;
  canCompose: boolean;
  canComposeReason: string | null;
  maxManagerTeams: number;
  unlockedManagerTeams: number;
  lineupsCount: number;
  prizePool: number | null;
  prizePoolCurrency: string | null;
  managerTeams: {
    id: string;
    name: string;
    activeDivision: number | null;
    divisionIconUrl: string | null;
    rarityType: string | null;
    seasonality: string | null;
  }[];
  divisions: DivisionView[];
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const msg = (err: unknown) => (err instanceof Error ? err.message : "Erreur");

/** Above this gap between our pStart and Sorare's, a pick is worth a second look before locking in. */
const DISAGREEMENT_THRESHOLD = 0.2;

/**
 * The game week as Sorare itself splits it: the league tracks the account can
 * enter, the manager teams inside each with the division they sit in, and for
 * every division either the line-up actually fielded or exactly what it is
 * short of.
 *
 * Replaces a picker over four competitions typed by hand into
 * lib/services/rules.ts — see lib/services/divisions.ts for why that could
 * never match a real account.
 */
export default function DivisionBoard({
  currentFixture,
  onSelectPlayer,
  onError,
}: {
  currentFixture: string | null;
  onSelectPlayer: (slug: string) => void;
  onError: (message: string) => void;
}) {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [seasonalityFilter, setSeasonalityFilter] = useState<"all" | "IN_SEASON" | "ALL_SEASONS">("all");
  const [openDivisions, setOpenDivisions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiFetch<FixtureRow[]>("/api/fixtures")
      .then((rows) => {
        setFixtures(rows);
        setSelected((prev) => prev ?? currentFixture ?? rows[0]?.slug ?? null);
      })
      .catch((err) => onError(msg(err)));
    // currentFixture seeds the default selection once; it isn't a re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (fixtureSlug: string) => {
      setLoading(true);
      try {
        const data = await apiFetch<{ tracks: TrackView[] }>(
          `/api/divisions?fixture=${encodeURIComponent(fixtureSlug)}`
        );
        setTracks(data.tracks);
      } catch (err) {
        onError(msg(err));
      } finally {
        setLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (selected) load(selected);
  }, [selected, load]);

  async function refresh() {
    if (!selected) return;
    setSyncing(true);
    try {
      await apiFetch("/api/divisions/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixture: selected }),
      });
      await load(selected);
    } catch (err) {
      onError(msg(err));
    } finally {
      setSyncing(false);
    }
  }

  const fixture = fixtures.find((f) => f.slug === selected) ?? null;
  const visibleTracks = (tracks ?? []).filter(
    (t) => seasonalityFilter === "all" || t.seasonality === seasonalityFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Game week"
          className="flex-1 min-w-0 bg-ink border border-line rounded-md px-3 py-2 text-sm"
        >
          {fixtures.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.gameWeek != null ? `GW${f.gameWeek}` : (f.displayName ?? f.slug)}
              {f.startDate && f.endDate ? ` · ${shortDate(f.startDate)}–${shortDate(f.endDate)}` : ""}
              {f.slug === currentFixture ? " · en cours" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          disabled={syncing || !selected}
          title="Resynchroniser divisions et compos depuis Sorare"
          className="shrink-0 border border-line font-bold px-3 py-2 rounded-md text-sm disabled:opacity-50"
        >
          {syncing ? "…" : "↻ Actualiser"}
        </button>
      </div>

      {fixture?.cutOffDate && (
        <p className="font-mono text-[11px] text-muted">
          Clôture{" "}
          {new Date(fixture.cutOffDate).toLocaleString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      <div className="flex gap-1.5">
        {(
          [
            ["all", "Toutes"],
            ["IN_SEASON", "In-season"],
            ["ALL_SEASONS", "Classic"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSeasonalityFilter(value)}
            className={`text-xs rounded-md px-2.5 py-1.5 border ${
              seasonalityFilter === value ? "border-flood text-flood" : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="font-mono text-sm text-muted">Chargement…</p>}

      {!loading && tracks != null && tracks.length === 0 && (
        <p className="font-mono text-sm text-muted">
          Aucune division synchronisée pour cette game week — tape « Actualiser » pour aller chercher tes
          divisions réelles sur Sorare (connexion requise, onglet Données).
        </p>
      )}

      {!loading &&
        visibleTracks.map((track) => (
          <section key={track.slug} className="rounded-lg bg-ink2 border border-line overflow-hidden">
            <div className="px-3 py-2.5 border-b border-line">
              <div className="flex items-center gap-2">
                {track.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                  <img src={track.iconUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
                )}
                <h3 className="font-display uppercase text-base leading-none truncate flex-1">
                  {track.displayName}
                </h3>
                {track.seasonality === "IN_SEASON" && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-ok/15 text-ok font-mono">
                    IS
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-muted mt-1">
                {track.unlockedManagerTeams}/{track.maxManagerTeams} équipe
                {track.maxManagerTeams > 1 ? "s" : ""} · {track.lineupsCount} compo
                {track.lineupsCount > 1 ? "s" : ""}
                {track.prizePool != null && ` · dotation ${Math.round(track.prizePool)} ${track.prizePoolCurrency ?? ""}`}
              </p>
              {!track.canCompose && track.canComposeReason && (
                <p className="text-[11px] text-warn mt-1">{track.canComposeReason}</p>
              )}
            </div>

            {track.managerTeams.length > 0 && (
              <ul className="px-3 py-2 flex flex-wrap gap-2 border-b border-line">
                {track.managerTeams.map((team) => (
                  <li
                    key={team.id}
                    className="flex items-center gap-1.5 text-[11px] font-mono bg-ink rounded-md px-2 py-1"
                  >
                    {team.divisionIconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                      <img src={team.divisionIconUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                    )}
                    <span className="truncate max-w-[140px]">{team.name}</span>
                    {team.activeDivision != null && (
                      <span className="text-flood">Div. {team.activeDivision}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <ul className="divide-y divide-line">
              {track.divisions.length === 0 && (
                <li className="px-3 py-2.5 font-mono text-xs text-muted">Aucune division ouverte ici.</li>
              )}
              {track.divisions.map((d) => {
                const key = `${track.slug}:${d.slug}`;
                const open = openDivisions[key] ?? false;
                return (
                  <li key={d.slug}>
                    <button
                      type="button"
                      onClick={() => setOpenDivisions((prev) => ({ ...prev, [key]: !open }))}
                      aria-expanded={open}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood focus-visible:ring-inset"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          d.hasLineup ? "bg-ok" : d.canCompose ? "bg-flood" : "bg-warn"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-bold block truncate">{d.displayName}</span>
                        <span className="text-[11px] font-mono text-muted block truncate">
                          {d.hasLineup
                            ? `${d.lineup.length || "—"} joueur${d.lineup.length > 1 ? "s" : ""} aligné${d.lineup.length > 1 ? "s" : ""}`
                            : d.canCompose
                              ? "Aucune compo — tu as les cartes"
                              : d.missingCards > 0
                                ? `Il manque ${d.missingCards} carte${d.missingCards > 1 ? "s" : ""}${d.missingPositions.length ? ` (${d.missingPositions.join(", ")})` : ""}`
                                : (d.canComposeReason ?? "Non accessible")}
                        </span>
                      </span>
                      <span className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
                        ▾
                      </span>
                    </button>

                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {d.eligibility.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
                              Cartes éligibles
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {d.eligibility.map((e) => (
                                <span
                                  key={`${e.position}-${e.seasonality}`}
                                  className="text-[11px] font-mono bg-ink rounded-md px-2 py-1"
                                  title={`${e.usedCardsCount} déjà engagée(s) sur ${e.totalCount}`}
                                >
                                  {POSITION_SHORT[e.position] ?? e.position}{" "}
                                  <span className={e.available > 0 ? "text-ok" : "text-warn"}>{e.available}</span>
                                  <span className="text-muted">/{e.totalCount}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {d.lineup.length > 0 ? (
                          <ul className="flex flex-col gap-1.5">
                            {d.lineup.map((r) => {
                              const disagrees = (r.disagreement ?? 0) >= DISAGREEMENT_THRESHOLD;
                              return (
                                <li key={r.cardSlug}>
                                  <button
                                    type="button"
                                    onClick={() => onSelectPlayer(r.playerSlug)}
                                    className={`w-full text-left flex items-center gap-2.5 p-2 rounded-md bg-ink border-l-[3px] hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood ${
                                      disagrees ? "border-l-warn" : "border-l-transparent"
                                    }`}
                                  >
                                    {r.picture ? (
                                      // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                                      <img
                                        src={r.picture}
                                        alt=""
                                        loading="lazy"
                                        className="w-8 h-8 rounded-full object-cover bg-ink2 shrink-0"
                                      />
                                    ) : (
                                      <span className="w-8 h-8 rounded-full bg-ink2 shrink-0" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span className="text-sm font-bold truncate flex items-center gap-1.5">
                                        {r.playerName}
                                        {r.captain && (
                                          <span className="shrink-0 px-1 rounded bg-flood text-ink text-[9px] font-bold">
                                            C
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[10px] font-mono text-muted block truncate">
                                        {r.position ? (POSITION_SHORT[r.position] ?? r.position) : ""}
                                        {disagrees && <span className="text-warn"> · désaccord de probabilité</span>}
                                      </span>
                                    </span>
                                    <span className="text-right shrink-0 font-mono text-[10px]">
                                      <span className="block">
                                        Nous <span className="text-flood">{pct(r.ourPStart)}</span>
                                      </span>
                                      <span className="flex items-center gap-1 justify-end">
                                        {r.sorareOddsProviderIconUrl && (
                                          // eslint-disable-next-line @next/next/no-img-element -- remote provider icon
                                          <img src={r.sorareOddsProviderIconUrl} alt="" className="w-2.5 h-2.5" />
                                        )}
                                        Sorare <span className="text-muted">{pct(r.sorareStarterOdds)}</span>
                                      </span>
                                      {r.actualStarted != null && (
                                        <span className={`block ${r.actualStarted ? "text-ok" : "text-warn"}`}>
                                          {r.actualStarted ? "a joué" : "banc"}
                                          {r.actualScore != null && ` · ${r.actualScore.toFixed(0)}`}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="font-mono text-xs text-muted">
                            {d.hasLineup
                              ? "Compo enregistrée sur Sorare — tape « Actualiser » pour en charger le détail."
                              : "Aucune compo alignée dans cette division."}
                          </p>
                        )}

                        {d.prizePool != null && (
                          <p className="font-mono text-[11px] text-muted">
                            Dotation {Math.round(d.prizePool)} {d.prizePoolCurrency ?? ""}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
