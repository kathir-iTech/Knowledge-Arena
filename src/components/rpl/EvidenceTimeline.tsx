"use client";

import { cn } from "@/lib/utils";

interface EvidenceItem {
  id: string;
  type: "photo" | "certificate" | "document" | "video";
  title: string;
  description?: string;
  date: string | Date;
  unitId?: string;
  packId?: string;
  thumbnail?: string; // data URL or URL
}

interface EvidenceTimelineProps {
  items: EvidenceItem[];
  className?: string;
  showFilter?: boolean;
}

/** Evidence timeline — shows uploaded evidence items chronologically. */
export function EvidenceTimeline({
  items,
  className,
  showFilter = true,
}: EvidenceTimelineProps) {
  const sortedItems = [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const types = ["photo", "certificate", "document", "video"] as const;
  const typeLabels: Record<string, string> = {
    photo: "Photo",
    certificate: "Certificate",
    document: "Document",
    video: "Video",
  };
  const typeIcons: Record<string, React.ReactNode> = {
    photo: <span className="text-primary">📷</span>,
    certificate: <span className="text-success">🏆</span>,
    document: <span className="text-accent">📄</span>,
    video: <span className="text-warning">🎥</span>,
  };

  return (
    <div className={cn("space-y-4", className)}>
      {showFilter && types.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter evidence by type">
          <button
            type="button"
            className="text-[11px] font-medium text-primary px-2 py-1 rounded-full bg-primary/10"
            aria-pressed="true"
          >
            All ({sortedItems.length})
          </button>
          {types.map((t) => {
            const count = sortedItems.filter((i) => i.type === t).length;
            if (count === 0) return null;
            return (
              <button
                key={t}
                type="button"
                className="text-[11px] text-muted-foreground px-2 py-1 rounded-full hover:bg-muted hover:text-foreground transition-colors"
                aria-pressed="false"
              >
                {typeLabels[t]} ({count})
              </button>
            );
          })}
        </div>
      )}

      {sortedItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <span className="text-2xl">📎</span>
          </div>
          <p className="text-sm text-muted-foreground">No evidence uploaded yet</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Add photos, certificates, or documents to support your declaration
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/20 to-transparent" aria-hidden="true" />

          <div className="space-y-5 pl-10">
            {sortedItems.map((item, index) => (
              <article
                key={item.id}
                className={cn(
                  "relative animate-in",
                  "transition-all duration-200 hover:translate-x-1"
                )}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Timeline dot */}
                <div className="absolute -left-10 top-1 flex h-8 w-8 items-center justify-center">
                  <div
                    className={cn(
                      "flex h-100% w-100% items-center justify-center rounded-full ring-2 ring-background transition-all",
                      item.type === "photo" && "bg-primary/20 text-primary",
                      item.type === "certificate" && "bg-success/20 text-success",
                      item.type === "document" && "bg-accent/20 text-accent",
                      item.type === "video" && "bg-warning/20 text-warning"
                    )}
                  >
                    {typeIcons[item.type]}
                  </div>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                </div>

                {/* Card */}
                <div className="card-hover rounded-xl border bg-card p-4 shadow-elevation-small">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            item.type === "photo" && "bg-primary/10 text-primary",
                            item.type === "certificate" && "bg-success/10 text-success",
                            item.type === "document" && "bg-accent/10 text-accent",
                            item.type === "video" && "bg-warning/10 text-warning"
                          )}
                        >
                          {typeLabels[item.type]}
                        </span>
                        {item.unitId && (
                          <span className="font-mono text-[10px] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted">
                            {item.unitId}
                          </span>
                        )}
                        {item.packId && (
                          <span className="font-mono text-[10px] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted">
                            {item.packId}
                          </span>
                        )}
                      </div>
                      <h4 className="mt-2 font-medium truncate">{item.title}</h4>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <time
                      className="shrink-0 font-mono text-[10px] text-muted-foreground whitespace-nowrap"
                      dateTime={item.date instanceof Date ? item.date.toISOString() : item.date}
                    >
                      {new Date(item.date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>

                  <div className="mt-3 relative aspect-square bg-muted overflow-hidden">
                    {/* Evidence placeholder */}
                    {item.type === "photo" && (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <span className="text-lg opacity-50">📷</span>
                      </div>
                    )}
                    {item.type === "certificate" && (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <span className="text-lg opacity-50">🏆</span>
                      </div>
                    )}
                    {item.type === "document" && (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <span className="text-lg opacity-50">📄</span>
                      </div>
                    )}
                    {item.type === "video" && (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <span className="text-lg opacity-50">🎥</span>
                      </div>
                    )}
                    {!(item.type === "photo" || item.type === "certificate" || item.type === "document" || item.type === "video") && (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <span className="text-lg opacity-50">📎</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}