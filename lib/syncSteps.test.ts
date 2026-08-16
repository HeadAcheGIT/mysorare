import { describe, it, expect, vi } from "vitest";
import {
  SYNC_STEPS,
  runSyncSteps,
  skipReason,
  summarizeSyncRun,
  type SyncContext,
  type SyncStep,
} from "./syncSteps";

function ctx(over: Partial<SyncContext> = {}): SyncContext {
  return {
    fixture: "football-14-18-aug-2026",
    signedIn: true,
    onProgress: () => {},
    fetchJson: vi.fn(async () => ({})) as SyncContext["fetchJson"],
    ...over,
  };
}

const step = (key: string, over: Partial<SyncStep> = {}): SyncStep => ({
  key,
  label: key,
  detail: "",
  needsSession: false,
  needsFixture: false,
  run: async () => "fait",
  ...over,
});

describe("skipReason", () => {
  it("skips a session step when signed out", () => {
    expect(skipReason(step("x", { needsSession: true }), { fixture: "f", signedIn: false })).toBe(
      "connexion Sorare requise"
    );
  });

  it("runs a session step when signed in", () => {
    expect(skipReason(step("x", { needsSession: true }), { fixture: "f", signedIn: true })).toBeNull();
  });

  it("skips a fixture step when no game week is known", () => {
    expect(skipReason(step("x", { needsFixture: true }), { fixture: null, signedIn: true })).toBe(
      "aucune game week connue"
    );
  });

  it("lets public steps run signed out and without a game week", () => {
    expect(skipReason(step("x"), { fixture: null, signedIn: false })).toBeNull();
  });
});

describe("runSyncSteps", () => {
  it("keeps going after a failure instead of aborting the run", async () => {
    // The whole point: nine independent steps must not be lost because the
    // second one failed.
    const steps = [
      step("a"),
      step("b", {
        run: async () => {
          throw new Error("Sorare a refusé");
        },
      }),
      step("c"),
    ];
    const out = await runSyncSteps(ctx(), steps);
    expect(out.map((o) => o.status)).toEqual(["ok", "error", "ok"]);
    expect(out[1].message).toBe("Sorare a refusé");
  });

  it("still completes the public steps when signed out", async () => {
    const steps = [step("public"), step("privé", { needsSession: true })];
    const out = await runSyncSteps(ctx({ signedIn: false }), steps);
    expect(out[0].status).toBe("ok");
    expect(out[1].status).toBe("skipped");
  });

  it("never calls a skipped step", async () => {
    const run = vi.fn(async () => "fait");
    await runSyncSteps(ctx({ signedIn: false }), [step("x", { needsSession: true, run })]);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs steps in the order given", async () => {
    const order: string[] = [];
    const mk = (k: string) =>
      step(k, {
        run: async () => {
          order.push(k);
          return "fait";
        },
      });
    await runSyncSteps(ctx(), [mk("1"), mk("2"), mk("3")]);
    expect(order).toEqual(["1", "2", "3"]);
  });

  it("reports a non-Error rejection rather than crashing", async () => {
    const out = await runSyncSteps(ctx(), [
      step("x", {
        run: async () => {
          throw "chaîne nue";
        },
      }),
    ]);
    expect(out[0]).toMatchObject({ status: "error", message: "erreur inconnue" });
  });
});

describe("summarizeSyncRun", () => {
  it("counts what worked", () => {
    const out = [
      { key: "a", label: "A", status: "ok" as const, message: "" },
      { key: "b", label: "B", status: "ok" as const, message: "" },
    ];
    expect(summarizeSyncRun(out)).toBe("2/2 étape(s) à jour");
  });

  it("names the skipped steps rather than just counting them", () => {
    // "3 ignorées" leaves the manager guessing which half of the app is stale.
    const out = [
      { key: "a", label: "Joueurs", status: "ok" as const, message: "" },
      { key: "b", label: "Divisions", status: "skipped" as const, message: "connexion Sorare requise" },
    ];
    expect(summarizeSyncRun(out)).toContain("Divisions");
  });

  it("surfaces failures", () => {
    const out = [{ key: "a", label: "A", status: "error" as const, message: "boum" }];
    expect(summarizeSyncRun(out)).toContain("1 en échec");
  });

  it("handles an empty run", () => {
    expect(summarizeSyncRun([])).toBe("Rien à synchroniser.");
  });
});

describe("SYNC_STEPS", () => {
  it("has unique keys", () => {
    const keys = SYNC_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts the player enrichment first, since everything joins on Player", () => {
    expect(SYNC_STEPS[0].key).toBe("players");
  });

  it("groups the public steps ahead of the session-only ones", () => {
    // So a signed-out run finishes the whole useful part before it starts
    // skipping.
    const firstSession = SYNC_STEPS.findIndex((s) => s.needsSession);
    const lastPublic = SYNC_STEPS.map((s) => s.needsSession).lastIndexOf(false);
    expect(firstSession).toBeGreaterThan(lastPublic - 1);
    expect(lastPublic).toBeLessThan(firstSession);
  });

  it("marks every fixture-dependent step as needing a session too", () => {
    // Each of them reads currentUser; a fixture alone would not be enough.
    for (const s of SYNC_STEPS.filter((x) => x.needsFixture)) {
      expect(s.needsSession).toBe(true);
    }
  });

  it("gives every step a label and a detail line", () => {
    for (const s of SYNC_STEPS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.detail.length).toBeGreaterThan(0);
    }
  });
});
