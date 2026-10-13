"use client";

import { cn } from "@/lib/utils";

interface CompetencyRadarProps {
  data: Array<{
    axis: string;
    value: number; // 0-100
    max?: number;
  }>;
  size?: number;
  className?: string;
  showLabels?: boolean;
  levels?: number;
}

/**
 * SVG radar/spider chart for competency profiles.
 * Shows unit-by-unit mastery percentages.
 * With fewer than 3 axes a radar polygon degenerates to a dot/line, so we
 * render an honest bar list instead of a misleading single-dot chart.
 */
export function CompetencyRadar({
  data,
  size = 280,
  className,
  showLabels = true,
  levels = 5,
}: CompetencyRadarProps) {
  if (data.length < 3) {
    return (
      <div className={cn('w-full space-y-2', className)} role="img" aria-label="Competency scores">
        {data.map((d) => (
          <div key={d.axis} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{d.axis}</span>
              <span className="font-medium text-foreground">{Math.round(d.value)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-xs text-muted-foreground">No competency data yet.</p>
        )}
      </div>
    );
  }
  const center = size / 2;
  const maxRadius = center - 24;
  const axes = data.length;

  const getPoint = (value: number, index: number, max = 100) => {
    const angle = (index * 2 * Math.PI) / axes - Math.PI / 2;
    const radius = (value / max) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Grid polygons
  const gridPolygons = Array.from({ length: levels }, (_, i) => {
    const level = i + 1;
    const radius = (level / levels) * maxRadius;
    return data.map((_, j) => {
      const angle = (j * 2 * Math.PI) / axes - Math.PI / 2;
      return `${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`;
    }).join(" ");
  });

  // Axis lines
  const axisLines = data.map((_, i) => {
    const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
    return {
      x1: center,
      y1: center,
      x2: center + maxRadius * Math.cos(angle),
      y2: center + maxRadius * Math.sin(angle),
    };
  });

  // Data polygon
  const dataPoints = data.map((d, i) => getPoint(d.value, i, d.max)).map(p => `${p.x},${p.y}`).join(" ");

  // Axis labels
  const labelPositions = data.map((d, i) => {
    const angle = (i * 2 * Math.PI) / axes - Math.PI / 2;
    const labelRadius = maxRadius + 18;
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      angle: angle * 180 / Math.PI,
      label: d.axis,
    };
  });

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Grid polygons */}
          <g stroke="var(--border)" strokeWidth={1} fill="none" opacity={0.5}>
            {gridPolygons.map((points, i) => (
              <polygon key={i} points={points} />
            ))}
          </g>

          {/* Axis lines */}
          <g stroke="var(--border)" strokeWidth={1} opacity={0.5}>
            {axisLines.map((line, i) => (
              <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </g>

          {/* Data polygon */}
          <polygon
            points={dataPoints}
            fill="var(--primary)"
            fillOpacity={0.15}
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Data points */}
          <g>
            {data.map((d, i) => {
              const point = getPoint(d.value, i, d.max);
              return (
                <g key={i}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={5}
                    fill="var(--primary)"
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={8}
                    fill="transparent"
                  />
                </g>
              );
            })}
          </g>

          {/* Axis labels */}
          {showLabels && (
            <g fontSize={11} fontWeight={500} fill="var(--muted-foreground)" fontFamily="var(--font-inter), sans-serif">
              {labelPositions.map(({ x, y, angle, label }, i) => {
                let textAnchor: "start" | "middle" | "end" = "middle";
                let dominantBaseline: "auto" | "middle" | "hanging" = "middle";
                
                if (angle < -135 || angle > 135) {
                  textAnchor = "middle";
                  dominantBaseline = "hanging";
                } else if (angle < -45) {
                  textAnchor = "end";
                  dominantBaseline = "middle";
                } else if (angle < 45) {
                  textAnchor = "middle";
                  dominantBaseline = "auto";
                } else if (angle < 135) {
                  textAnchor = "start";
                  dominantBaseline = "middle";
                }

                return (
                  <text
                    key={i}
                    x={x}
                    y={y}
                    textAnchor={textAnchor}
                    dominantBaseline={dominantBaseline}
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          )}

          {/* Level indicators */}
          <g fontSize={9} fill="var(--muted-foreground)" fontFamily="var(--font-inter), sans-serif" fontVariant="tabular-nums">
            {Array.from({ length: levels }, (_, i) => {
              const level = i + 1;
              const radius = (level / levels) * maxRadius;
              return (
                <text
                  key={level}
                  x={center + 4}
                  y={center - radius}
                  textAnchor="start"
                  dominantBaseline="middle"
                >
                  {Math.round((level / levels) * 100)}%
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}