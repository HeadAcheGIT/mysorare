"use client";

import { useEffect } from "react";

/**
 * Production only, and it actively unregisters itself in development.
 *
 * sw.js serves everything under /_next/static/ cache-first, which is correct
 * for a build — those URLs are content-hashed, so a new build is a new URL.
 * `next dev` doesn't hash them: the chunk keeps its name and only its content
 * changes, so the worker pins the first copy it ever saw and every later edit
 * silently stops reaching the browser. Restarting the server doesn't help,
 * and it costs a long, wrong debugging session to notice.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Anyone who ran a dev server before this fix still has the worker
      // installed, so clearing it has to happen here rather than only being
      // avoided from now on.
      navigator.serviceWorker.getRegistrations().then(
        (regs) => regs.forEach((r) => r.unregister()),
        () => {}
      );
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app still works without the shell cache, it just
      // won't be installable as reliably on the home screen.
    });
  }, []);
  return null;
}
