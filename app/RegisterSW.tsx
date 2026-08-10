"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app still works without the shell cache, it just
        // won't be installable as reliably on the home screen.
      });
    }
  }, []);
  return null;
}
