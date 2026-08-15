import { prisma } from "../prisma";
import { graphql } from "../sorare/client";
import { MY_WATCHLISTS } from "../sorare/queries";

/**
 * Brings the manager's own Sorare watchlists into the app.
 *
 * Until now the app's watchlist was a second, parallel list: every target had
 * to be re-added by hand even though Sorare already held it. Since the
 * watchlist is what drives the auction monitor (lib/services/auctions.ts),
 * anything missing here was simply never watched for a bargain.
 *
 * Sorare's list is treated as a **source, not a mirror**: players are added and
 * refreshed, never removed. Deleting local rows because they're absent upstream
 * would throw away lists the manager built inside this app, and a one-way
 * import can't tell the two apart.
 */

/** One Sorare watchlist, as the API returns it. */
interface SorareWatchlist {
  id: string;
  slug: string | null;
  title: string | null;
  createdAt: string | null;
  playersPanel:
    | {
        anyPlayer: {
          slug: string;
          displayName: string | null;
          anyPositions: string[] | null;
          activeClub: { name: string | null } | null;
        } | null;
      }[]
    | null;
}

export interface WatchlistImportResult {
  /** Sorare watchlists seen. */
  lists: number;
  /** Local groups created, as opposed to matched to an existing one. */
  groupsCreated: number;
  /** Players newly added to a list. */
  added: number;
  /** Players already present, refreshed rather than duplicated. */
  updated: number;
  /** Per-list detail, so the UI can say which list got what. */
  details: { name: string; added: number; updated: number }[];
}

/**
 * A Sorare list with no title still needs a stable name, since the name is what
 * a re-import matches on. The slug is stable where the title is user-editable.
 */
function listName(w: SorareWatchlist): string {
  const title = w.title?.trim();
  if (title) return title;
  return w.slug?.trim() || `Liste Sorare ${w.id}`;
}

export async function importSorareWatchlists(): Promise<WatchlistImportResult> {
  const data = await graphql<{ currentUser: { myWatchlists: SorareWatchlist[] | null } | null }>(
    MY_WATCHLISTS
  );

  const lists = data?.currentUser?.myWatchlists ?? [];

  const result: WatchlistImportResult = {
    lists: lists.length,
    groupsCreated: 0,
    added: 0,
    updated: 0,
    details: [],
  };

  for (const list of lists) {
    const name = listName(list);

    // Matched by name rather than blindly created, so re-importing updates the
    // same group instead of stacking duplicates every run. WatchlistGroup.name
    // carries no unique constraint, hence findFirst rather than upsert.
    let group = await prisma.watchlistGroup.findFirst({ where: { name } });
    if (!group) {
      group = await prisma.watchlistGroup.create({ data: { name } });
      result.groupsCreated++;
    }

    let added = 0;
    let updated = 0;

    for (const entry of list.playersPanel ?? []) {
      const p = entry?.anyPlayer;
      if (!p?.slug) continue;

      const row = {
        label: p.displayName ?? p.slug,
        position: p.anyPositions?.[0] ?? null,
        club: p.activeClub?.name ?? null,
      };

      const existing = await prisma.watchlistItem.findUnique({
        where: { playerSlug_groupId: { playerSlug: p.slug, groupId: group.id } },
      });

      await prisma.watchlistItem.upsert({
        where: { playerSlug_groupId: { playerSlug: p.slug, groupId: group.id } },
        create: { playerSlug: p.slug, groupId: group.id, ...row },
        update: row,
      });

      if (existing) updated++;
      else added++;
    }

    result.added += added;
    result.updated += updated;
    result.details.push({ name, added, updated });
  }

  await prisma.syncLog.create({
    data: {
      job: "watchlists",
      status: "ok",
      detail: `${result.lists} liste(s) Sorare, ${result.added} joueur(s) ajouté(s), ${result.updated} mis à jour`,
    },
  });

  return result;
}
