"use client";

import { cn } from "@/lib/utils";

interface NsqfLadderProps {
  /** Current candidate level (1-10) */
  currentLevel: number;
  /** Pack title for context */
  packTitle?: string;
  /** Show level descriptions */
  showDescriptions?: boolean;
  className?: string;
  orientation?: "vertical" | "horizontal";
}

/**
 * NSQF Level Ladder (1-10) — shows candidate's current level highlighted.
 * Used on profile and result pages.
 */
export function NsqfLadder({
  currentLevel,
  packTitle,
  showDescriptions = true,
  className,
  orientation = "vertical",
}: NsqfLadderProps) {
  const levels = [
    { level: 1, label: "Basic cognitive/ practical skills", desc: "Apply basic knowledge in structured contexts" },
    { level: 2, label: "Basic factual knowledge", desc: "Carry out routine tasks under supervision" },
    { level: 3, label: "Factual & theoretical knowledge", desc: "Apply known solutions to familiar problems" },
    { level: 4, label: "Broad factual & theoretical knowledge", desc: "Solve problems by selecting & applying methods" },
    { level: 5, label: "Specialised factual & theoretical knowledge", desc: "Develop creative solutions to abstract problems" },
    { level: 6, label: "Advanced knowledge, critical understanding", desc: "Manage complex technical/professional activities" },
    { level: 7, label: "Highly specialised knowledge", desc: "Develop new knowledge/procedures, integrate fields" },
    { level: 8, label: "Frontier knowledge", desc: "Substantial original research/innovation" },
    { level: 9, label: "Most advanced knowledge", desc: "Redefine knowledge/professional practice" },
    { level: 10, label: "Frontier of knowledge", desc: "Extend knowledge through original research" },
  ];

  const isVertical = orientation === "vertical";

  return (
    <div className={cn("space-y-4", className)}>
      {packTitle && (
        <p className="text-sm font-medium text-primary">
          {packTitle} — NSQF Level {currentLevel}
        </p>
      )}

      {isVertical ? (
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/20 via-primary/40 to-primary/20" aria-hidden="true" />

          <div className="space-y-3">
            {levels.slice().reverse().map((lvl) => {
              const isCurrent = lvl.level === currentLevel;
              const isBelow = lvl.level < currentLevel;

              return (
                <div
                  key={lvl.level}
                  className={cn(
                    "flex items-center gap-4 relative z-10 transition-all duration-300",
                    isCurrent && "scale-[1.02]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-headline text-sm font-bold tabular-nums transition-all duration-300",
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/20"
                        : isBelow
                        ? "bg-success/15 text-success border border-success/30"
                        : "bg-muted text-muted-foreground border border-border"
                    )}
                  >
                    {lvl.level}
                  </div>

                  <div className={cn("flex-1 min-w-0 transition-colors duration-300", isCurrent && "text-foreground")}>
                    <p className={cn("font-medium truncate", isCurrent && "font-bold")}>
                      Level {lvl.level} — {lvl.label}
                    </p>
                    {showDescriptions && (
                      <p className={cn("text-[11px] truncate", isCurrent ? "text-muted-foreground/80" : "text-muted-foreground/60")}>
                        {lvl.desc}
                      </p>
                    )}
                  </div>

                  {isCurrent && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Current
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="flex items-end gap-1 min-w-max" role="list" aria-label="NSQF Levels">
            {levels.map((lvl) => {
              const isCurrent = lvl.level === currentLevel;
              const isBelow = lvl.level < currentLevel;
              const height = 40 + (lvl.level / 10) * 80;

              return (
                <div
                  key={lvl.level}
                  className={cn(
                    "flex flex-col items-center gap-1.5 relative transition-all duration-300",
                    isCurrent && "z-10"
                  )}
                  role="listitem"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-all duration-300",
                      isCurrent
                        ? "bg-primary"
                        : isBelow
                        ? "bg-success"
                        : "bg-muted"
                    )}
                    style={{ height }}
                  >
                    {isCurrent && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary whitespace-nowrap">
                          Current
                        </span>
                      </div>
                    )}
                  </div>

                  <span className={cn("text-[10px] font-bold tabular-nums", isCurrent ? "text-primary" : "text-muted-foreground")}>
                    {lvl.level}
                  </span>

                  {showDescriptions && (
                    <span className="text-[9px] text-muted-foreground/60 whitespace-nowrap max-w-[80px] truncate text-center">
                      {lvl.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}