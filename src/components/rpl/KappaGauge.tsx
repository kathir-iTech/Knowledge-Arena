"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface KappaGaugeProps {
  kappa: number | null;
  n?: number;
  size?: number;
  showLabel?: boolean;
  showBands?: boolean;
  className?: string;
}

/**
 * Cohen's kappa gauge with Landis-Koch bands.
 * Shows the computed kappa with interpretation and N.
 */
export function KappaGauge({
  kappa,
  n,
  size = 200,
  showLabel = true,
  showBands = true,
  className,
}: KappaGaugeProps) {
  const radius = size / 2 - 16;
  const strokeWidth = 14;

  // Clamp kappa for display
  const displayKappa = kappa === null ? null : Math.max(-1, Math.min(1, kappa));

  // Convert kappa to angle: -1 -> -90deg, 1 -> 90deg (180deg sweep)
  const angle = displayKappa !== null ? displayKappa * 90 : 0;

  // Landis-Koch bands
  const bands = [
    { label: "Poor", range: [-1, 0.2], color: "var(--destructive)" },
    { label: "Fair", range: [0.2, 0.4], color: "var(--warning)" },
    { label: "Moderate", range: [0.4, 0.6], color: "var(--accent)" },
    { label: "Substantial", range: [0.6, 0.8], color: "var(--success)" },
    { label: "Almost perfect", range: [0.8, 1], color: "var(--success)" },
  ];

  const getBandAngle = (kappaValue: number) => kappaValue * 90 - 90;
  const getBandDash = (start: number, end: number) => {
    const startAngle = getBandAngle(start);
    const endAngle = getBandAngle(end);
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (startAngle + 90) / 180;
    const length = circumference * (endAngle - startAngle) / 180;
    return { offset, length, circumference };
  };

  const interpretation = kappa === null
    ? "No data"
    : kappa < 0.2 ? "Poor"
    : kappa < 0.4 ? "Fair"
    : kappa < 0.6 ? "Moderate"
    : kappa < 0.8 ? "Substantial"
    : "Almost perfect";

  const interpretationColor = kappa === null
    ? "var(--muted-foreground)"
    : kappa < 0.2 ? "var(--destructive)"
    : kappa < 0.4 ? "var(--warning)"
    : kappa < 0.6 ? "var(--accent)"
    : kappa < 0.8 ? "var(--success)"
    : "var(--success)";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />

          {/* Landis-Koch bands */}
          {showBands && (
            <g>
              {bands.map((band, _i) => {
                // eslint-disable-line @typescript-eslint/no-unused-vars
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { offset, length, circumference } = getBandDash(band.range[0], band.range[1]);
                return (
                  <circle
                    key={band.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={band.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${length} ${circumference}`}
                    strokeDashoffset={-offset}
                    opacity={0.25}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}

          {/* Center label */}
          {showLabel && (
            <g className="pointer-events-none">
              <text
                x={size / 2}
                y={size / 2 - 8}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={size * 0.16}
                fontWeight={700}
                fontFamily="var(--font-inter), sans-serif"
                fill="var(--foreground)"
                className="tabular-nums"
              >
                {kappa === null ? "—" : kappa.toFixed(2)}
              </text>
              <text
                x={size / 2}
                y={size / 2 + 18}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={size * 0.055}
                fontWeight={600}
                fontFamily="var(--font-playfair-display), serif"
                fill={interpretationColor}
                letterSpacing="0.05em"
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
              >
                {interpretation}
              </text>
            </g>
          )}

          {/* Needle */}
          {displayKappa !== null && (
            <g transform={`rotate(${angle} ${size / 2} ${size / 2})`}>
              <line
                x1={size / 2}
                y1={size / 2 - 4}
                x2={size / 2}
                y2={size / 2 - radius + 6}
                stroke="var(--foreground)"
                strokeWidth={3}
                strokeLinecap="round"
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={5}
                fill="var(--primary)"
              />
            </g>
          )}
        </svg>
      </div>

      {n !== undefined && (
        <p className="text-[11px] font-mono text-muted-foreground">
          N = {n} overlapping items
        </p>
      )}
    </div>
  );
}

/** Small inline kappa badge */
export function KappaBadge({
  kappa,
  className,
}: { kappa: number | null; className?: string }) {
  if (kappa === null) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        κ —
      </span>
    );
  }

  const interpretation = kappa < 0.2 ? "Poor" : kappa < 0.4 ? "Fair" : kappa < 0.6 ? "Moderate" : kappa < 0.8 ? "Substantial" : "Almost perfect";
  const color = kappa < 0.2 ? "destructive" : kappa < 0.4 ? "warning" : kappa < 0.6 ? "accent" : "success";

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(var(--${color}))` }} />
      <span className="font-headline tabular-nums" style={{ color: `hsl(var(--${color}))` }}>
        κ {kappa.toFixed(2)}
      </span>
      <Badge variant={color === "destructive" ? "destructive" : color === "warning" ? "warning" : color === "accent" ? "secondary" : "success"}>
        {interpretation}
      </Badge>
    </span>
  );
}