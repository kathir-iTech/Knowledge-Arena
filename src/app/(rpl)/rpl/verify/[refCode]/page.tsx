'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompassMark } from '@/components/rpl/CompassMark';
import { CheckCircle2, Clock, ShieldCheck, Printer, ArrowLeft } from 'lucide-react';

interface VerificationData {
  verified: boolean;
  referenceCode: string;
  workerName: string;
  trade: string;
  packId: string;
  nsqfLevel: number;
  status: 'certified' | 'pending_signoff';
  issuedAt: number;
  issuingAuthority: string;
  assessorNotes?: string;
  requiresHumanSignoff: boolean;
  governanceAudit: {
    methodology: string;
    decisionModel: string;
    isDemoData: boolean;
  };
}

export default function PublicCertificateVerifyPage() {
  const params = useParams<{ refCode: string }>();
  const refCode = decodeURIComponent(params?.refCode || '').trim();

  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!refCode) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/rpl/verify/${encodeURIComponent(refCode)}`);
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.verified) {
          if (!cancelled) {
            setError(json?.error || 'Certificate record could not be verified.');
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Network error verifying certificate. Please check your connection.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refCode]);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center p-6 text-center">
        <CompassMark size={48} className="animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying RPL credential on the registry…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Credential Not Verified</CardTitle>
            <CardDescription>{error || 'Record not found.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Reference code: <span className="font-mono font-semibold">{refCode}</span>
            </p>
            <Button asChild variant="outline">
              <Link href="/rpl">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to RPL Compass
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const isCertified = data.status === 'certified';
  const issuedDate = new Date(data.issuedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/rpl">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            RPL Compass Home
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="mr-1.5 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* Official Certificate Card */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-elevation-large sm:p-10 print:border-none print:shadow-none">
        {/* Subtle Watermark */}
        <div className="pointer-events-none absolute -right-16 -top-16 opacity-5" aria-hidden="true">
          <CompassMark size={320} />
        </div>

        {/* Certificate Header */}
        <div className="flex flex-col items-center border-b border-border pb-6 text-center">
          <div className="flex items-center gap-3">
            <CompassMark size={40} className="text-primary" />
            <div className="text-left">
              <h2 className="font-headline text-lg font-bold tracking-tight text-foreground">
                National Skills Qualification Framework (NSQF)
              </h2>
              <p className="text-xs text-muted-foreground">
                Recognition of Prior Learning (RPL) Credential Registry
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {isCertified ? (
              <Badge variant="success" className="gap-1 px-3 py-1 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Officially Certified
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1 px-3 py-1 text-xs font-semibold">
                <Clock className="h-3.5 w-3.5" />
                Assessment Complete · Pending Final Sign-Off
              </Badge>
            )}
            {data.governanceAudit.isDemoData && (
              <Badge variant="outline" className="text-[10px]">
                Synthetic Demo Record
              </Badge>
            )}
          </div>
        </div>

        {/* Candidate & Qualification Details */}
        <div className="my-8 space-y-6 text-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              This certifies competence assessment for
            </p>
            <h1 className="mt-1 font-headline text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              {data.workerName}
            </h1>
          </div>

          <div className="mx-auto max-w-md rounded-xl bg-secondary/50 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">Qualification Pack</p>
            <p className="mt-1 text-lg font-bold text-primary">{data.trade}</p>
            <p className="text-xs text-muted-foreground">
              Code: <span className="font-mono">{data.packId}</span> · National Qualification Level {data.nsqfLevel}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-y border-border py-4 text-left sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Reference Code</p>
              <p className="font-mono text-sm font-bold text-foreground break-all">{data.referenceCode}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Assessment Date</p>
              <p className="text-sm font-semibold text-foreground">{issuedDate}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Issuing Body</p>
              <p className="text-xs font-medium text-foreground">{data.issuingAuthority}</p>
            </div>
          </div>
        </div>

        {/* QR Code and Audit Proof */}
        <div className="flex flex-col items-center justify-between gap-6 border-t border-border pt-6 sm:flex-row">
          <div className="space-y-2 text-left">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              <span>Cryptographic Governance & Reliability Verified</span>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              {data.governanceAudit.methodology}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Governance: {data.governanceAudit.decisionModel}
            </p>
          </div>

          {/* Verification QR Code */}
          <div className="flex flex-col items-center rounded-xl border bg-white p-3 shadow-sm">
            <QRCode value={currentUrl || `https://knowledge-arena.vercel.app/rpl/verify/${data.referenceCode}`} size={84} />
            <span className="mt-1 text-[10px] font-mono text-neutral-600">Scan to Verify</span>
          </div>
        </div>
      </div>
    </main>
  );
}
