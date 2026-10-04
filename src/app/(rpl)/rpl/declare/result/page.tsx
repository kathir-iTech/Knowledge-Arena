'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusTracker, type TrackerStep } from '@/components/rpl/StatusTracker';
import type { MatchedPackSummary, RPLPackMatch, RPLStage, StatusResponse } from '@/lib/rpl/types';
import { AlertCircle, Check, CheckCircle2, Copy } from 'lucide-react';

/** Ref contract with the declaration wizard: ?ref= query param, else localStorage. */
const LAST_REF_KEY = 'rpl:lastRef';

/** Raw AI matches stashed by the declaration wizard (see declare/page.tsx). */
const AI_MATCHES_KEY = 'rpl:aiMatches';

function sanitizeStoredMatches(value: unknown): RPLPackMatch[] {
  if (!Array.isArray(value)) return [];
  const out: RPLPackMatch[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.packTitle !== 'string' || !rec.packTitle.trim()) continue;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
    out.push({
      packTitle: rec.packTitle.trim(),
      matchReason: typeof rec.matchReason === 'string' ? rec.matchReason : '',
      suggestedUnits: strArr(rec.suggestedUnits),
      assessmentQuestions: strArr(rec.assessmentQuestions),
    });
  }
  return out;
}

/**
 * Practice self-assessment section (additive): reads the wizard-stashed
 * localStorage['rpl:aiMatches'] and renders each match's assessmentQuestions.
 * Server-provided matchedPack.practiceQuestions (already rendered per-pack
 * above — that rendering is untouched) are ALSO merged in here by pack title,
 * plus any server-only packs. Renders nothing when no questions exist.
 */
function AiPracticeQuestions({ serverPacks }: { serverPacks: MatchedPackSummary[] }) {
  const [aiMatches, setAiMatches] = useState<RPLPackMatch[] | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AI_MATCHES_KEY);
      if (!raw) {
        setAiMatches(null);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      const cleaned = sanitizeStoredMatches(parsed);
      setAiMatches(cleaned.length > 0 ? cleaned : null);
    } catch {
      setAiMatches(null);
    }
  }, []);

  const serverByTitle = new Map<string, string[]>();
  for (const p of serverPacks ?? []) {
    if (p && Array.isArray(p.practiceQuestions) && p.practiceQuestions.length > 0) {
      serverByTitle.set(p.title, p.practiceQuestions);
    }
  }

  const rows: { title: string; questions: string[] }[] = [];
  for (const m of aiMatches ?? []) {
    const questions = [...m.assessmentQuestions, ...(serverByTitle.get(m.packTitle) ?? [])];
    if (questions.length > 0) rows.push({ title: m.packTitle, questions });
  }
  for (const p of serverPacks ?? []) {
    if (!p || !(Array.isArray(p.practiceQuestions) && p.practiceQuestions.length > 0)) continue;
    if ((aiMatches ?? []).some((m) => m.packTitle === p.title)) continue;
    rows.push({ title: p.title, questions: p.practiceQuestions });
  }

  if (rows.length === 0) return null;

  return (
    <section className="space-y-4" aria-label="Practice self-assessment questions">
      <h2 className="text-lg font-semibold text-foreground">
        Practice self-assessment questions before your formal assessment
      </h2>
      {rows.map((row) => (
        <Card key={row.title}>
          <CardHeader>
            <CardTitle className="text-base">{row.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {row.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

const NEXT_STEPS = [
  'Declaration reviewed',
  'Practical assessment scheduled',
  'Competency profile generated',
  'Certification recommendation',
  'Final assessor sign-off',
] as const;

function stepsForStage(stage: RPLStage): TrackerStep[] {
  switch (stage) {
    case 'certified':
      return NEXT_STEPS.map((label) => ({ label, state: 'done' as const }));
    case 'assessed':
      return NEXT_STEPS.map((label, i) => ({
        label,
        state: (i < 2 ? 'done' : i === 2 ? 'active' : 'pending') as TrackerStep['state'],
      }));
    case 'profile_ready':
      return NEXT_STEPS.map((label, i) => ({
        label,
        state: (i < 3 ? 'done' : i === 3 ? 'active' : 'pending') as TrackerStep['state'],
      }));
    case 'assessment_scheduled':
      return NEXT_STEPS.map((label, i) => ({
        label,
        state: (i < 1 ? 'done' : i === 1 ? 'active' : 'pending') as TrackerStep['state'],
      }));
    case 'declared':
    default:
      return NEXT_STEPS.map((label, i) => ({
        label,
        state: (i === 0 ? 'active' : 'pending') as TrackerStep['state'],
      }));
  }
}

function ResultContent() {
  // Authoritative page-level guard (the global (rpl) layout guard exists,
  // but this stays authoritative). Any signed-in role may view a result;
  // the status API enforces worker-sees-own vs commander/executive.
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const searchParams = useSearchParams();

  const [ref, setRef] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve the reference code: ?ref= wins, else the wizard's stored value.
  useEffect(() => {
    const fromQuery = searchParams.get('ref')?.trim();
    if (fromQuery) {
      try {
        window.localStorage.setItem(LAST_REF_KEY, fromQuery);
      } catch {
        /* storage unavailable — ref still works for this visit */
      }
      setRef(fromQuery);
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LAST_REF_KEY)?.trim() || null;
    } catch {
      stored = null;
    }
    setRef(stored && stored.length > 0 ? stored : null);
  }, [searchParams]);

  useEffect(() => {
    if (isLoading || !user || !ref) {
      if (!isLoading && user && !ref) setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) {
            setError('You are not signed in. Please sign in again.');
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/rpl/status/${encodeURIComponent(ref as string)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as StatusResponse & {
          error?: string;
        };
        if (!cancelled) {
          if (!res.ok || !body || Array.isArray(body)) {
            setError(
              typeof body?.error === 'string'
                ? body.error
                : res.status === 404
                  ? 'Declaration not found for this reference code.'
                  : 'Failed to load your declaration status.',
            );
          } else {
            setStatus(body);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load your declaration status. Please try again.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user, ref, auth]);

  async function copyRef(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Please sign in to view your declaration result.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!ref) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>No declaration reference found</CardTitle>
            <CardDescription>
              We could not find a reference code. Please complete your skill declaration first —
              your reference code is saved automatically when you finish.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Confirmation */}
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
          <div>
            <CardTitle>Your declaration has been received</CardTitle>
            <CardDescription>
              Our team will review your skills against the matched qualification packs below.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Quote this reference code at your physical assessment:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-[10px] border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
              {status?.referenceCode ?? ref}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyRef(status?.referenceCode ?? (ref as string))}
              aria-label="Copy reference code"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex items-start gap-2 pt-6">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      ) : (
        status && (
          <>
            {/* Matched packs */}
            <section className="space-y-4" aria-label="Matched qualification packs">
              <h2 className="text-lg font-semibold text-foreground">
                Matched qualification packs
              </h2>
              {status.matchedPacks.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      No packs matched yet — an assessor will map your declaration manually.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                status.matchedPacks.map((pack) => (
                  <Card key={pack.packId}>
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        {pack.title}
                        <Badge variant="default">NSQF Level {pack.nsqfLevel}</Badge>
                      </CardTitle>
                      <CardDescription>{pack.packId}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2" aria-label="Matched units">
                        {pack.matchedUnits.map((unit) => (
                          <Badge key={unit} variant="secondary">
                            {unit}
                          </Badge>
                        ))}
                      </div>
                      {/* Practice questions render only when the API provides
                          them; a peer agent adds Gemini questions later. */}
                      {pack.practiceQuestions && pack.practiceQuestions.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-foreground">
                            Practice questions
                          </h3>
                          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            {pack.practiceQuestions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            {/* AI practice questions (additive): stashed matches + merged
                server practiceQuestions; renders nothing when absent. */}
            <AiPracticeQuestions serverPacks={status.matchedPacks} />

            {/* What happens next */}
            <Card>
              <CardHeader>
                <CardTitle>What happens next</CardTitle>
                <CardDescription>
                  Track your journey from declaration to certification.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusTracker steps={stepsForStage(status.stage)} />
              </CardContent>
            </Card>
          </>
        )
      )}
    </main>
  );
}

export default function RplDeclareResultPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl space-y-4 p-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </main>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
