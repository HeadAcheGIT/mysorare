/**
 * Everything that pulls data from Sorare, as one ordered list.
 *
 * These used to be seven buttons in the Données tab plus two more buried in
 * other screens (the division board and the season report each ran their own).
 * Nothing said which mattered, in what order, or what a given one unlocked —
 * so keeping the app current meant remembering nine separate actions and where
 * they lived.
 *
 * Order is not cosmetic. `players` runs first because every other step joins on
 * Player rows, and the slow public-API work is grouped ahead of the
 * session-only steps so a signed-out run still finishes the useful part.
 *
 * Sorare only. The friendlies and official-line-up checks come from
 * API-Football and stay their own buttons: folding them in would make a
 * "synchroniser avec Sorare" run fail on a missing APIFOOTBALL_KEY, which
 * says nothing about Sorare.
 *
 * Pure and free of server imports — `fetchJson` is injected, so the whole
 * sequence can be tested without a network or a database.
 */

export type StepStatus = "ok" | "skipped" | "error";

export interface SyncContext {
  /** The game week several steps hang off. Null means they can't run. */
  fixture: string | null;
  /** True once a Sorare session exists (JWT or Sorare Connect). */
  signedIn: boolean;
  /** Called as a step advances, for live feedback on long loops. */
  onProgress: (stepKey: string, message: string) => void;
  fetchJson: <T>(input: string, init?: RequestInit) => Promise<T>;
}

export interface SyncStep {
  key: string;
  label: string;
  /** What it unlocks, in one line — shown next to the step. */
  detail: string;
  /** Reads `currentUser`, so it needs a Sorare session. */
  needsSession: boolean;
  /** Hangs off a game week; skipped when none is known. */
  needsFixture: boolean;
  /** Returns a short French summary of what it did. */
  run: (ctx: SyncContext) => Promise<string>;
}

export interface StepOutcome {
  key: string;
  label: string;
  status: StepStatus;
  message: string;
}

const post = <T>(ctx: SyncContext, url: string, body?: unknown) =>
  ctx.fetchJson<T>(url, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

/**
 * Guard for the batched endpoints.
 *
 * Every loop here is "call until nothing is left", which is a non-terminating
 * loop the moment a server stops making progress. The guard bounds it rather
 * than letting a refresh spin forever against a broken route.
 */
const MAX_BATCHES = 200;

export const SYNC_STEPS: SyncStep[] = [
  {
    key: "players",
    label: "Joueurs, photos et scores",
    detail: "Clubs, blessures, scores récents, puis recalcul des projections.",
    needsSession: false,
    needsFixture: false,
    async run(ctx) {
      let guard = 0;
      for (;;) {
        const b = await post<{ processed: number; remaining: number; total: number; failed: number }>(
          ctx,
          "/api/enrich"
        );
        ctx.onProgress("players", `${b.total - b.remaining}/${b.total} joueurs`);
        if (b.failed > 0) throw new Error(`${b.failed} lot(s) en échec — voir le Journal.`);
        if (b.remaining === 0 || b.processed === 0) break;
        if (++guard > MAX_BATCHES) break;
      }
      ctx.onProgress("players", "calcul des projections…");
      const gw = await post<{ fixture: string | null; updated: number }>(ctx, "/api/gameweek");
      return `${gw.updated} projection(s)`;
    },
  },
  {
    key: "acquisitions",
    label: "Prix d'achat réels",
    detail: "Enchères, achats directs, offres, récompenses et packs — dont les achats en crédits.",
    needsSession: false,
    needsFixture: false,
    async run(ctx) {
      let cursor = 0;
      let priced = 0;
      let credits = 0;
      let guard = 0;
      for (;;) {
        const b = await post<{
          processed: number;
          priced: number;
          withCredits: number;
          nextCursor: number | null;
          total: number;
        }>(ctx, "/api/acquisitions", { cursor });
        priced += b.priced;
        credits += b.withCredits;
        ctx.onProgress("acquisitions", `${Math.min(cursor + b.processed, b.total)}/${b.total} cartes`);
        if (b.nextCursor == null) break;
        cursor = b.nextCursor;
        if (++guard > MAX_BATCHES) break;
      }
      return `${priced} prix${credits > 0 ? `, dont ${credits} en crédits` : ""}`;
    },
  },
  {
    key: "form",
    label: "Forme et titularisations",
    detail: "Matchs joués, minutes et place dans le onze — la base des probabilités.",
    needsSession: false,
    needsFixture: false,
    async run(ctx) {
      let cursor = 0;
      let guard = 0;
      for (;;) {
        const b = await post<{ processed: number; nextCursor: number | null; total: number }>(
          ctx,
          "/api/sync/batch",
          { cursor }
        );
        ctx.onProgress("form", `${Math.min(cursor + b.processed, b.total)}/${b.total} joueurs`);
        if (b.nextCursor == null) break;
        cursor = b.nextCursor;
        if (++guard > MAX_BATCHES) break;
      }
      return "à jour";
    },
  },
  {
    key: "valuations",
    label: "Valorisation des cartes",
    detail: "Ce que valent réellement tes cartes, d'après les ventes conclues.",
    needsSession: false,
    needsFixture: false,
    async run(ctx) {
      let done = 0;
      let failed = 0;
      let guard = 0;
      for (;;) {
        const b = await post<{ processed: number; remaining: number; total: number; failed: number }>(
          ctx,
          "/api/valuations/sync"
        );
        done += b.processed;
        failed += b.failed;
        ctx.onProgress("valuations", `${done}/${done + b.remaining} marchés`);
        if (b.remaining === 0 || b.processed === 0) break;
        if (++guard > MAX_BATCHES) break;
      }
      return done === 0 ? "déjà à jour" : `${done} marché(s)${failed ? `, ${failed} en échec` : ""}`;
    },
  },
  {
    key: "divisions",
    label: "Divisions et éligibilité",
    detail: "Tes tracks, tes divisions et ce que tu peux y aligner.",
    needsSession: true,
    needsFixture: true,
    async run(ctx) {
      const r = await post<{ tracks?: number; divisions?: number }>(ctx, "/api/divisions/sync", {
        fixture: ctx.fixture,
      });
      return `${r.divisions ?? 0} division(s)`;
    },
  },
  {
    key: "alignedLineups",
    label: "Compos déjà alignées",
    detail: "Les équipes engagées cette game week, pour confronter tes choix aux résultats.",
    needsSession: true,
    needsFixture: true,
    async run(ctx) {
      const r = await post<{ lineups?: number; cards?: number }>(ctx, "/api/lineups/aligned/sync", {
        fixture: ctx.fixture,
      });
      return `${r.lineups ?? 0} compo(s)`;
    },
  },
  {
    key: "sales",
    label: "Historique des ventes",
    detail: "Tes ventes et achats conclus sur le marché Sorare.",
    needsSession: true,
    needsFixture: false,
    async run(ctx) {
      const r = await post<{ imported?: number; sold?: number; bought?: number }>(ctx, "/api/sales/sync");
      return `${r.imported ?? (r.sold ?? 0) + (r.bought ?? 0)} opération(s)`;
    },
  },
  {
    key: "rewards",
    label: "Récompenses de la saison",
    detail: "Gains par game week — la moitié « recettes » du ROI.",
    needsSession: true,
    needsFixture: true,
    async run(ctx) {
      const r = await post<{ rewards?: number }>(ctx, "/api/rewards/sync", { fixture: ctx.fixture });
      return `${r.rewards ?? 0} récompense(s)`;
    },
  },
  {
    key: "watchlists",
    label: "Watchlists Sorare",
    detail: "Reprend tes listes Sorare — ajoute et met à jour, ne supprime jamais.",
    needsSession: true,
    needsFixture: false,
    async run(ctx) {
      const r = await post<{ lists: number; added: number; updated: number }>(ctx, "/api/watchlist/import");
      return `${r.lists} liste(s), ${r.added} ajout(s), ${r.updated} mise(s) à jour`;
    },
  },
];

/** Why a step can't run right now, or null when it can. */
export function skipReason(step: SyncStep, ctx: Pick<SyncContext, "fixture" | "signedIn">): string | null {
  if (step.needsSession && !ctx.signedIn) return "connexion Sorare requise";
  if (step.needsFixture && !ctx.fixture) return "aucune game week connue";
  return null;
}

/**
 * Runs the steps in order, and keeps going when one fails.
 *
 * A refresh that aborts on the first error is the worst outcome here: the
 * steps are independent, and stopping at step 2 of 10 because a Sorare session
 * expired would throw away eight things that would have worked.
 */
export async function runSyncSteps(
  ctx: SyncContext,
  steps: SyncStep[] = SYNC_STEPS
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];

  for (const step of steps) {
    const skip = skipReason(step, ctx);
    if (skip) {
      outcomes.push({ key: step.key, label: step.label, status: "skipped", message: skip });
      continue;
    }
    try {
      const message = await step.run(ctx);
      outcomes.push({ key: step.key, label: step.label, status: "ok", message });
    } catch (err) {
      outcomes.push({
        key: step.key,
        label: step.label,
        status: "error",
        message: err instanceof Error ? err.message : "erreur inconnue",
      });
    }
  }

  return outcomes;
}

/** One-line verdict for the notice bar. */
export function summarizeSyncRun(outcomes: StepOutcome[]): string {
  const ok = outcomes.filter((o) => o.status === "ok").length;
  const failed = outcomes.filter((o) => o.status === "error").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;

  if (!outcomes.length) return "Rien à synchroniser.";

  const parts = [`${ok}/${outcomes.length} étape(s) à jour`];
  if (failed) parts.push(`${failed} en échec`);
  // Named rather than counted: "3 ignorées" leaves the manager guessing which
  // half of the app is stale.
  if (skipped) {
    parts.push(
      `${skipped} ignorée(s) : ${outcomes
        .filter((o) => o.status === "skipped")
        .map((o) => o.label)
        .join(", ")}`
    );
  }
  return parts.join(" · ");
}
