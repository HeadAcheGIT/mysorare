"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT } from "@/lib/types";
import { startLabel, type PStartBasis } from "./StartProbability";
import LineupPitch, { type PitchPlayer } from "./LineupPitch";

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
  ourPStartBasis: PStartBasis;
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

type BenchCard = {
  benchObjectId: string;
  cardSlug: string | null;
  playerSlug: string;
  playerName: string;
  position: string;
  rarity: string;
  bonus: number;
  sorareProjected: number | null;
  locked: boolean;
  ourExpected: number | null;
  ourPStart: number | null;
  sorareStarterOdds: number | null;
};

type ProposalCard = {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  picture: string | null;
  position: string;
  expected: number;
  pStart: number;
  isCaptain: boolean;
};

type DivisionProposal = {
  leaderboardSlug: string;
  bench: BenchCard[];
  lockedCount: number;
  proposal: { cards: ProposalCard[]; captain: string | null; total: number } | null;
  infeasibleReason: string | null;
  delta: {
    currentTotal: number | null;
    proposedTotal: number;
    gain: number | null;
    cardsIn: string[];
    cardsOut: string[];
  } | null;
  validation: {
    rewardMultiplier: number | null;
    feedbackRules: { ruleName: string; state: string; message: string | null }[];
  } | null;
};

/**
 * The failed case is a real state, not an absence: the bench needs a Sorare
 * session, and silently rendering nothing when it's missing is precisely the
 * kind of invisible gap that made this screen untrustworthy.
 */
type BenchState =
  | { status: "loading" }
  | { status: "ready"; data: DivisionProposal }
  | { status: "error"; message: string };

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const msg = (err: unknown) => (err instanceof Error ? err.message : "Erreur");

/** Above this gap between our pStart and Sorare's, a pick is worth a second look before locking in. */
const DISAGREEMENT_THRESHOLD = 0.2;

/** What's actually fielded, laid out for the pitch: probability up front, ground truth (played/benched) once known. */
function alignedToPitch(rows: ComparisonRow[]): PitchPlayer[] {
  return rows.map((r) => {
    const disagrees = (r.disagreement ?? 0) >= DISAGREEMENT_THRESHOLD;
    const notes: string[] = [];
    if (r.actualStarted != null) {
      notes.push(r.actualStarted ? `a joué${r.actualScore != null ? ` · ${r.actualScore.toFixed(0)}` : ""}` : "banc");
    }
    if (disagrees) notes.push("désaccord");
    return {
      key: r.cardSlug,
      playerSlug: r.playerSlug,
      playerName: r.playerName,
      picture: r.picture,
      position: r.position ?? "Midfielder",
      captain: r.captain,
      statValue: pct(r.ourPStart),
      statLabel: startLabel(r.ourPStartBasis),
      note: notes.length ? notes.join(" · ") : undefined,
      noteTone: r.actualStarted === false || disagrees ? "warn" : r.actualStarted === true ? "ok" : undefined,
      ringTone: disagrees ? "warn" : null,
      faded: r.actualStarted === false,
    };
  });
}

/** The optimiser's suggestion, laid out for the pitch: projected score up front, "à ajouter" flagging what's new vs. the current line-up. */
function proposedToPitch(cards: ProposalCard[], cardsIn: string[] | undefined): PitchPlayer[] {
  return cards.map((c) => {
    const isNew = cardsIn?.includes(c.cardSlug) ?? false;
    return {
      key: c.cardSlug,
      playerSlug: c.playerSlug,
      playerName: c.playerName,
      picture: c.picture,
      position: c.position,
      captain: c.isCaptain,
      statValue: one(c.expected),
      statLabel: pct(c.pStart),
      note: isNew ? "à ajouter" : undefined,
      noteTone: isNew ? "ok" : undefined,
      ringTone: isNew ? "ok" : null,
    };
  });
}

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
  // Which pitch a division shows — defaults to whatever's aligned when there is one, else the proposal, so opening a division never lands on an empty pitch.
  const [pitchTab, setPitchTab] = useState<Record<string, "aligned" | "proposed">>({});
  // Bench + proposal are fetched per division, on open: a game week exposes
  // ~76 leaderboards, so loading them all up front would be mostly wasted.
  const [benches, setBenches] = useState<Record<string, BenchState>>({});
  /**
   * 0-100 sliders, not 0-1 — the API normalises by their sum regardless of
   * scale, so this is purely about what reads naturally as a percentage.
   * Default reproduces the standard proposal exactly (100% projection
   * globale, see DEFAULT_LINEUP_WEIGHTS in divisionLineup.ts).
   */
  const [weights, setWeights] = useState({ form: 0, titu: 0, proj: 100 });

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

  /** Loads a division's real bench and best available line-up, once, on first open — or again when the weights below change. */
  const loadBench = useCallback(
    async (leaderboardSlug: string) => {
      if (!selected) return;
      setBenches((prev) => ({ ...prev, [leaderboardSlug]: { status: "loading" } }));
      try {
        const data = await apiFetch<DivisionProposal>(
          `/api/divisions/bench?leaderboard=${encodeURIComponent(leaderboardSlug)}&fixture=${encodeURIComponent(selected)}` +
            `&wForm=${weights.form}&wTitu=${weights.titu}&wProj=${weights.proj}`
        );
        setBenches((prev) => ({ ...prev, [leaderboardSlug]: { status: "ready", data } }));
      } catch (err) {
        // Kept in place rather than surfaced only as a toast: the reason
        // belongs next to the division it concerns.
        setBenches((prev) => ({ ...prev, [leaderboardSlug]: { status: "error", message: msg(err) } }));
      }
    },
    [selected, weights]
  );

  function toggleDivision(key: string, leaderboardSlug: string, isOpen: boolean) {
    setOpenDivisions((prev) => ({ ...prev, [key]: !isOpen }));
    if (!isOpen && !benches[leaderboardSlug]) loadBench(leaderboardSlug);
  }

  const openLeaderboardSlugs = useMemo(() => {
    const slugs: string[] = [];
    for (const t of tracks ?? []) {
      for (const d of t.divisions) {
        if (openDivisions[`${t.slug}:${d.slug}`]) slugs.push(d.slug);
      }
    }
    return slugs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, openDivisions]);

  // Re-propose whichever divisions are already open when the sliders move —
  // debounced so dragging doesn't fire a request per pixel. Opening a
  // division for the first time already loads on its own, via toggleDivision.
  useEffect(() => {
    if (!openLeaderboardSlugs.length) return;
    const timer = setTimeout(() => {
      for (const slug of openLeaderboardSlugs) loadBench(slug);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  async function refresh() {
    if (!selected) return;
    // A resync invalidates every bench: eligibility and locks move with it.
    setBenches({});
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
              {/* Sorare exposes two numbers: `displayName` counts weeks inside the
                  season ("Game Week 7") and `gameWeek` counts them since 2019
                  (706). The header uses the first, so this picking the second
                  labelled the very same week two different ways one tab apart. */}
              {f.displayName ?? (f.gameWeek != null ? `GW${f.gameWeek}` : f.slug)}
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

      <div className="rounded-lg bg-ink2 border border-line p-3 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wide text-muted">
          Pondération de la compo proposée
        </p>
        {(
          [
            ["form", "Forme récente"],
            ["titu", "Titularisation probable"],
            ["proj", "Projection globale"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <span className="w-36 shrink-0 text-muted">{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={weights[key]}
              onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
              aria-label={label}
              className="flex-1"
            />
            <span className="w-8 shrink-0 text-right font-mono text-muted">{weights[key]}</span>
          </label>
        ))}
        {weights.form === 0 && weights.titu === 0 && (
          <p className="font-mono text-[10px] text-muted">
            Réglage par défaut — identique à la proposition standard.
          </p>
        )}
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
                      onClick={() => toggleDivision(key, d.slug, open)}
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

                        {(() => {
                          const bench = benches[d.slug];
                          const active = pitchTab[d.slug] ?? (d.lineup.length > 0 ? "aligned" : "proposed");
                          const setActive = (tab: "aligned" | "proposed") =>
                            setPitchTab((prev) => ({ ...prev, [d.slug]: tab }));
                          const gain = bench?.status === "ready" ? (bench.data.delta?.gain ?? null) : null;

                          return (
                            <div className="space-y-2">
                              {/* Segmented like Sorare's own line-up/preview switch — one pitch on screen at a
                                  time rather than the two lists stacked, which is what made this screen read
                                  as a report instead of an actual team you could picture. */}
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setActive("aligned")}
                                  className={`flex-1 text-xs font-bold rounded-md px-2 py-1.5 border ${
                                    active === "aligned" ? "border-flood text-flood bg-flood/10" : "border-line text-muted"
                                  }`}
                                >
                                  Alignée
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActive("proposed")}
                                  className={`flex-1 text-xs font-bold rounded-md px-2 py-1.5 border ${
                                    active === "proposed" ? "border-flood text-flood bg-flood/10" : "border-line text-muted"
                                  }`}
                                >
                                  Proposée
                                  {gain != null && gain > 0.05 && <span className="ml-1 text-ok">+{one(gain)}</span>}
                                </button>
                              </div>

                              {active === "aligned" ? (
                                <>
                                  <LineupPitch
                                    players={alignedToPitch(d.lineup)}
                                    onSelectPlayer={onSelectPlayer}
                                    emptyMessage={
                                      d.hasLineup
                                        ? "Compo enregistrée sur Sorare — tape « Actualiser » pour en charger le détail."
                                        : "Aucune compo alignée dans cette division."
                                    }
                                  />
                                  {d.lineup.some((r) => (r.disagreement ?? 0) >= DISAGREEMENT_THRESHOLD) && (
                                    <p className="font-mono text-[10px] text-warn">
                                      ⚠ un cerclage rouge marque un poste où notre modèle et Sorare divergent d&apos;au
                                      moins {Math.round(DISAGREEMENT_THRESHOLD * 100)} points de probabilité.
                                    </p>
                                  )}
                                </>
                              ) : !bench || bench.status === "loading" ? (
                                <p className="font-mono text-xs text-muted">Chargement du vivier…</p>
                              ) : bench.status === "error" ? (
                                // Le message d'origine (souvent celui de l'auth Sorare) dit déjà quoi faire —
                                // le répéter ici ne ferait que le noyer.
                                <p className="font-mono text-xs text-warn">
                                  Vivier et compo proposée indisponibles — {bench.message}
                                </p>
                              ) : (
                                (() => {
                                  const { proposal, delta, validation, lockedCount, bench: cards, infeasibleReason } =
                                    bench.data;
                                  const blocking = (validation?.feedbackRules ?? []).filter(
                                    (r) => r.state !== "VALID" && r.state !== "valid"
                                  );
                                  return (
                                    <>
                                      {infeasibleReason || !proposal ? (
                                        <p className="font-mono text-xs text-warn">
                                          Impossible de composer ici avec les cartes disponibles
                                          {lockedCount > 0 &&
                                            ` (${lockedCount} déjà engagée${lockedCount > 1 ? "s" : ""} ailleurs)`}
                                          .
                                        </p>
                                      ) : (
                                        <>
                                          <LineupPitch
                                            players={proposedToPitch(proposal.cards, delta?.cardsIn)}
                                            onSelectPlayer={onSelectPlayer}
                                          />
                                          <p className="font-mono text-[11px] text-muted">
                                            <span className="font-display text-xl text-flood align-middle">
                                              {one(proposal.total)}
                                            </span>{" "}
                                            pts projetés
                                            {delta?.gain != null && (
                                              <span className={delta.gain > 0 ? "text-ok" : delta.gain < 0 ? "text-warn" : ""}>
                                                {" · "}
                                                {delta.gain > 0 ? "+" : ""}
                                                {one(delta.gain)} vs ta compo actuelle
                                              </span>
                                            )}
                                            {delta?.currentTotal == null && d.hasLineup && " · compo actuelle non chiffrable"}
                                          </p>
                                          {delta && delta.cardsOut.length > 0 && (
                                            <p className="font-mono text-[10px] text-warn">
                                              {delta.cardsOut.length} carte{delta.cardsOut.length > 1 ? "s" : ""} à sortir
                                            </p>
                                          )}
                                          {validation && (
                                            <p
                                              className={`font-mono text-[10px] ${blocking.length ? "text-warn" : "text-ok"}`}
                                              title="Verdict renvoyé par Sorare pour cette compo"
                                            >
                                              {blocking.length
                                                ? `Sorare refuse : ${blocking.map((r) => r.message ?? r.ruleName).join(" · ")}`
                                                : `Validée par Sorare${validation.rewardMultiplier != null ? ` · multiplicateur ×${validation.rewardMultiplier}` : ""}`}
                                            </p>
                                          )}
                                        </>
                                      )}
                                      <p className="font-mono text-[10px] text-muted">
                                        Vivier : {cards.length} carte{cards.length > 1 ? "s" : ""} éligible
                                        {cards.length > 1 ? "s" : ""}
                                        {lockedCount > 0 && ` · ${lockedCount} déjà engagée${lockedCount > 1 ? "s" : ""}`}
                                      </p>
                                    </>
                                  );
                                })()
                              )}
                            </div>
                          );
                        })()}

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
