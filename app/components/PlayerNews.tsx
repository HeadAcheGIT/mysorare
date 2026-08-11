"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { relativeDate } from "@/lib/format";

type NewsItem = { title: string; link: string; source: string | null; date: string | null };

/**
 * Recent news for a player, via Google News — the point being to replace
 * manually checking X/Google News per player. Lazy-loaded on open, one
 * player at a time: this is a courtesy public feed with no documented rate
 * limit, so it's never called in bulk across a squad.
 */
export default function PlayerNews({ name }: { name: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    apiFetch<{ items: NewsItem[] }>(`/api/news?name=${encodeURIComponent(name)}`)
      .then((d) => !cancelled && setItems(d.items))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Indisponible"));
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (error) return <p className="text-xs text-warn">{error}</p>;
  if (!items) return <p className="font-mono text-xs text-muted">Chargement…</p>;
  if (items.length === 0) return <p className="font-mono text-xs text-muted">Rien de récent trouvé.</p>;

  return (
    <ul className="divide-y divide-line">
      {items.map((it, i) => (
        <li key={i} className="py-1.5">
          <a
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs hover:underline decoration-muted underline-offset-2"
          >
            {it.title}
          </a>
          <p className="text-[10px] font-mono text-muted mt-0.5">
            {it.source ?? "Source inconnue"}
            {it.date && ` · ${relativeDate(it.date)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
