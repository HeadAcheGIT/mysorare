export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-line/60 rounded-md ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="p-3 rounded-lg bg-ink2 border border-line space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-12 rounded-md" />
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-line/40">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Chargement des cartes…">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
