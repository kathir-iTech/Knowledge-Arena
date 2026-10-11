"use client";

import { cn } from "@/lib/utils";

interface CompassMarkProps {
  size?: number;
  className?: string;
  rotateOnHover?: boolean;
  ariaLabel?: string;
}

/**
 * RPL Compass logo — SVG compass with needle.
 * The needle can rotate on hover (respects prefers-reduced-motion).
 * Used in header, login, loaders, empty states.
 */
export function CompassMark({
  size = 32,
  className,
  rotateOnHover = true,
  ariaLabel = "RPL Compass",
}: CompassMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "transition-transform duration-300 ease-out",
        rotateOnHover && "hover:rotate-6 group-hover:rotate-6",
        className
      )}
      style={{
        animation: "compass-float 6s ease-in-out infinite",
      } as React.CSSProperties}
    >
      {/* Outer ring */}
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.6"
        className="text-primary"
      />
      {/* Inner ring */}
      <circle
        cx="24"
        cy="24"
        r="16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
        className="text-primary"
      />
      {/* Cardinal directions N/E/S/W */}
      <g className="text-primary" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="24" y1="6" x2="24" y2="10" />
        <line x1="24" y1="38" x2="24" y2="42" />
        <line x1="6" y1="24" x2="10" y2="24" />
        <line x1="38" y1="24" x2="42" y2="24" />
      </g>
      {/* Secondary inter-cardinals */}
      <g className="text-primary" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5">
        <line x1="14.5" y1="14.5" x2="17.5" y2="17.5" />
        <line x1="30.5" y1="14.5" x2="33.5" y2="17.5" />
        <line x1="14.5" y1="33.5" x2="17.5" y2="30.5" />
        <line x1="30.5" y1="33.5" x2="33.5" y2="30.5" />
      </g>
      {/* Compass needle — north pointing */}
      <g className="transform transition-transform duration-300" style={{ transformOrigin: "24px 24px" }}>
        {/* Needle shadow */}
        <path
          d="M24 24 L24 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-primary"
          opacity="0.3"
          transform="rotate(8 24 24)"
        />
        {/* Main needle */}
        <path
          d="M24 24 L24 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-primary"
          filter="drop-shadow(0 2px 2px rgba(0,0,0,0.15))"
        />
        {/* Needle base */}
        <circle cx="24" cy="24" r="4" fill="currentColor" className="text-primary" />
        {/* South tip */}
        <path
          d="M24 24 L24 36"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-accent"
          opacity="0.7"
        />
      </g>
      {/* Center dot */}
      <circle cx="24" cy="24" r="2" fill="currentColor" className="text-accent" />
      <style jsx>{`
        @keyframes compass-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
    </svg>
  );
}

/** Small compass for inline use (24px) */
export function CompassMarkSmall({ className, ...props }: CompassMarkProps) {
  return <CompassMark size={24} className={className} {...props} />;
}

/** Large compass for hero/loaders (64px) */
export function CompassMarkLarge({ className, ...props }: CompassMarkProps) {
  return <CompassMark size={64} className={className} {...props} />;
}