"use client";

import { cn } from "@/lib/utils";

interface CertificateCardProps {
  /** Verification code to display */
  verificationCode: string;
  /** Candidate name */
  candidateName: string;
  /** Current NSQF level */
  nqsfLevel: number;
  /** Date issued / last reviewed */
  issuedAt: string | Date;
  /** Whether sign-off is pending */
  pendingSignOff?: boolean;
  /** On-click handler */
  onViewDetail?: () => void;
  className?: string;
}

/**
 * CertificateCard — compact card showing certification status
 * and verification code. Used in profile and admin dashboards.
 */
export function CertificateCard({
  verificationCode,
  candidateName,
  nqsfLevel,
  issuedAt,
  pendingSignOff = false,
  onViewDetail,
  className,
}: CertificateCardProps) {
  const date = new Date(issuedAt);
  const formattedDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 shadow-elevation-small hover:shadow-elevation-medium transition-shadow",
      className
    )}>
      <div className="flex items-start justify-between gap-4">
        {/* Left side - candidate info */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Candidate
          </p>
          <h4 className="mt-1 font-medium text-foreground truncate">
            {candidateName}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            NSQF Level {nqsfLevel}
          </p>
        </div>

        {/* Right side - certificate details */}
        <div className="text-right">
          {/* FIX-W5: a pending preview must not claim "Certified / Issued" */}
          <p className="mt-1 text-sm text-muted-foreground">{pendingSignOff ? 'Pending sign-off' : 'Certified'}</p>
          <p className="mt-1 font-medium text-foreground">
            NSQF Level {nqsfLevel}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {pendingSignOff ? 'Not yet issued' : `Issued ${formattedDate}`}
          </p>
          {pendingSignOff && (
            <p className="mt-1 text-xs text-destructive">
              Pending assessor sign-off
            </p>
          )}
        </div>
      </div>

      {/* Bottom - verification code */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Verification Code
        </p>
        <p className="mt-1 font-mono text-xl font-bold text-primary break-all">
          {verificationCode}
        </p>
        {onViewDetail && (
          <button
            type="button"
            onClick={onViewDetail}
            className="mt-2 text-xs text-primary hover:underline"
            aria-label="View full certificate details"
          >
            View details
          </button>
        )}
      </div>
    </div>
  );
}

/** Small version for compact layouts */
export function CertificateCardSmall({
  verificationCode,
  candidateName,
  nqsfLevel,
  issuedAt,
  className,
}: Omit<CertificateCardProps, "pendingSignOff" | "onViewDetail">) {
  return (
    <CertificateCard
      verificationCode={verificationCode}
      candidateName={candidateName}
      nqsfLevel={nqsfLevel}
      issuedAt={issuedAt}
      className={className}
    />
  );
}

/** Large version for admin dashboard */
export function CertificateCardLarge({
  verificationCode,
  candidateName,
  nqsfLevel,
  issuedAt,
  pendingSignOff,
  onViewDetail,
  className,
}: CertificateCardProps) {
  return (
    <CertificateCard
      verificationCode={verificationCode}
      candidateName={candidateName}
      nqsfLevel={nqsfLevel}
      issuedAt={issuedAt}
      pendingSignOff={pendingSignOff}
      onViewDetail={onViewDetail}
      className={className}
    />
  );
}