'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  NSQF_PACKS,
  findBestMatchingPacks,
  listSectors,
  type NSQFMatchResult,
} from '@/lib/rpl/nsqf-packs';
import type { DeclarationMark } from '@/lib/rpl/types';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getPendingSummary, queueDeclarationForSync, type PendingSummary } from '@/lib/rpl/offline-store';
import { syncPendingDeclarations } from '@/lib/rpl/offline-sync';

// Inline constant: standard Indian states (~28 entries).
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const STEPS = [
  'Personal & trade',
  'Experience declaration',
  'Evidence summary',
  'Review & submit',
] as const;

const MARKS: { value: DeclarationMark; label: string }[] = [
  { value: 'can-do', label: 'I can do this' },
  { value: 'done', label: 'I have done this before' },
  { value: 'never', label: 'I have never done this' },
];

interface DeclarePayload {
  trade: string;
  sector: string;
  yearsExperience: number;
  location: string;
  employerType: string;
  declarationsByPack: Record<string, { unitId: string; status: DeclarationMark }[]>;
  evidenceTextByPack: Record<string, string>;
  declarationText: string;
  matchedPacks: string[];
}

export default function RplDeclarePage() {
  // Authoritative page-level guard (a global (rpl) layout guard also exists;
  // this guard stays authoritative). Any signed-in user may declare.
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [trade, setTrade] = useState('');
  const [sector, setSector] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [location, setLocation] = useState('');
  const [employerType, setEmployerType] = useState('');
  // Checklist source of truth. A peer agent will add a Gemini
  // "Find matching qualifications" button that only calls setMatchedPacks.
  const [matchedPacks, setMatchedPacks] = useState<NSQFMatchResult[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, DeclarationMark>>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI pack-matching (additive): loading flag + offline banner state. The
  // keyword-matcher effect above stays the checklist source of truth.
  const [aiMatching, setAiMatching] = useState(false);
  // Surfaced when Gemini is down or the request fails: the keyword matches
  // stay on screen but the worker is told WHY they are not AI-ranked.
  const [aiMatchNote, setAiMatchNote] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<PendingSummary>({ total: 0, needsSignIn: 0, errors: 0 });
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const { status: connectionStatus } = useOnlineStatus();

  const sectors = useMemo(() => listSectors(), []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
  }, [user, isLoading, router]);

  // B1: the visible state of the offline queue (counts only, never silent).
  const refreshQueue = useCallback(async () => {
    try {
      setQueueState(await getPendingSummary());
    } catch {
      setQueueState({ total: 0, needsSignIn: 0, errors: 0 });
    }
  }, []);

  // B1: replay with a FRESH ID token at replay time; failures keep records
  // queued and are reported here (401 -> "sign in to sync", never dropped).
  const runQueueSync = useCallback(async () => {
    if (connectionStatus === 'offline') return;
    setSyncing(true);
    try {
      const report = await syncPendingDeclarations({
        isAuthenticated: Boolean(user),
        getIdToken: async (forceRefresh) => {
          if (!auth?.currentUser) return null;
          return auth.currentUser.getIdToken(forceRefresh).catch(() => null);
        },
      });
      // B2: a replayed declaration returns its human reference code — persist
      // and announce it so an offline worker never loses it (or sees a UID).
      let referenceNote: string | null = null;
      if (report.referenceCodes.length > 0) {
        const code = report.referenceCodes[report.referenceCodes.length - 1];
        try {
          localStorage.setItem('rpl:lastRef', code);
        } catch {
          /* storage unavailable — note still shows this visit */
        }
        referenceNote = `Synced your saved declaration. Your reference code is ${code}.`;
      }
      if (report.total > 0) {
        if (report.synced > 0 && report.synced === report.total) {
          setSyncNote(`Synced ${report.synced} saved declaration${report.synced === 1 ? '' : 's'}.`);
        } else if (report.synced > 0) {
          setSyncNote(
            `Synced ${report.synced} of ${report.total} — the rest stay saved: ${report.errors[0] ?? 'see below'}`,
          );
        } else {
          setSyncNote(report.errors[0] ?? 'Could not sync yet — your declaration stays saved on this device.');
        }
      } else {
        setSyncNote(null);
      }
      if (referenceNote) setSyncNote(referenceNote);
    } catch (err) {
      setSyncNote(
        `Sync failed (${err instanceof Error ? err.message : String(err)}) — your declaration stays saved on this device.`,
      );
    } finally {
      setSyncing(false);
      await refreshQueue();
    }
  }, [auth, connectionStatus, refreshQueue, user]);

  // Refresh counts whenever connectivity/auth changes; replay automatically
  // when we come back online or finish signing in.
  useEffect(() => {
    void refreshQueue();
  }, [connectionStatus, user, refreshQueue]);

  useEffect(() => {
    if (connectionStatus === 'offline' || !user) return;
    void runQueueSync();
  }, [connectionStatus, user, runQueueSync]);

  // The service worker asks the page to replay (it cannot: no Firebase SDK).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'RPL_SYNC_PENDING') {
        void runQueueSync();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [runQueueSync]);

  // Client-side matcher: top 3 packs for [trade, sector]. Never blank —
  // fall back to the top NSQF_PACKS entry with all of its units.
  useEffect(() => {
    const results = findBestMatchingPacks({ keywords: [trade, sector], trade });
    const top = results.slice(0, 3);
    if (top.length > 0) {
      setMatchedPacks(top);
    } else {
      setMatchedPacks([
        {
          pack: NSQF_PACKS[0],
          score: 0,
          matchedUnits: NSQF_PACKS[0].competencyUnits.map((u) => u.name),
        },
      ]);
    }
  }, [trade, sector]);

  // Default every unit to "never" without clobbering existing worker marks.
  useEffect(() => {
    setMarks((prev) => {
      const next: Record<string, Record<string, DeclarationMark>> = { ...prev };
      let changed = false;
      for (const m of matchedPacks) {
        if (!next[m.pack.id]) {
          next[m.pack.id] = {};
          changed = true;
        }
        for (const u of m.pack.competencyUnits) {
          if (!next[m.pack.id][u.id]) {
            next[m.pack.id] = { ...next[m.pack.id], [u.id]: 'never' };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [matchedPacks]);

  function setMark(packId: string, unitId: string, mark: DeclarationMark) {
    setMarks((prev) => ({
      ...prev,
      [packId]: { ...(prev[packId] ?? {}), [unitId]: mark },
    }));
  }

  // Packs with at least one can-do/done mark need an evidence narrative.
  const evidencePacks = useMemo(
    () =>
      matchedPacks.filter((m) =>
        m.pack.competencyUnits.some((u) => {
          const mark = marks[m.pack.id]?.[u.id] ?? 'never';
          return mark === 'can-do' || mark === 'done';
        }),
      ),
    [matchedPacks, marks],
  );

  // B1: a declaration is only meaningful when the worker claims at least one
  // skill. Counts every can-do/done across all matched packs; step 2's Next
  // and the submit button are blocked while this is 0, and the API enforces
  // the same rule so a stale client can never persist an empty declaration.
  const claimedSkillCount = useMemo(() => {
    let n = 0;
    for (const m of matchedPacks) {
      for (const u of m.pack.competencyUnits) {
        const mark = marks[m.pack.id]?.[u.id] ?? 'never';
        if (mark === 'can-do' || mark === 'done') n += 1;
      }
    }
    return n;
  }, [matchedPacks, marks]);
  const hasClaimedSkill = claimedSkillCount > 0;

  function buildPayload(): DeclarePayload {
    const years = Number(yearsExperience);
    const declarationsByPack: DeclarePayload['declarationsByPack'] = {};
    for (const m of matchedPacks) {
      declarationsByPack[m.pack.id] = m.pack.competencyUnits.map((u) => ({
        unitId: u.id,
        status: marks[m.pack.id]?.[u.id] ?? 'never',
      }));
    }
    const evidenceTextByPack: Record<string, string> = {};
    for (const m of evidencePacks) {
      evidenceTextByPack[m.pack.id] = (evidence[m.pack.id] ?? '').slice(0, 500);
    }
    const declarationText = `${trade} worker with ${yearsExperience} years of experience in ${sector || 'general'} (${location || 'India'}). ${Object.values(evidenceTextByPack).join(' ')}`.slice(
      0,
      2000,
    );
    return {
      trade: trade.trim(),
      sector,
      yearsExperience: Number.isFinite(years) ? years : 0,
      location,
      employerType,
      declarationsByPack,
      evidenceTextByPack,
      declarationText,
      matchedPacks: matchedPacks.map((m) => m.pack.id),
    };
  }

  // Single submit entry point: POSTs to /api/rpl/declare, persists the
  // referenceCode, and navigates to the result page. A peer will add offline
  // queueing around this function later without restructuring it.
  async function submitDeclaration(payload: DeclarePayload) {
    setSubmitting(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) {
        setError('You are not signed in. Please sign in again.');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/rpl/declare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as {
        referenceCode?: string;
        queued?: boolean;
        error?: string;
      } | null;
      // The service worker queues on a network failure and answers 202 —
      // that is a SUCCESSFUL save-for-later, not an error (B1).
      if (res.status === 202 || body?.queued === true) {
        setOfflineNotice('Saved on this device — it will sync automatically when you reconnect.');
        await refreshQueue();
        setSubmitting(false);
        return;
      }
      if (!res.ok || !body?.referenceCode) {
        setError(
          typeof body?.error === 'string' ? body.error : 'Submit failed. Please try again.',
        );
        setSubmitting(false);
        return;
      }
      localStorage.setItem('rpl:lastRef', body.referenceCode);
      router.push(`/rpl/declare/result?ref=${encodeURIComponent(body.referenceCode)}`);
    } catch {
      // P11b offline fallback (additive): queue for background sync and show
      // an inline notice instead of navigating. submitDeclaration's shape is
      // unchanged — only the network-failure path gains this branch.
      try {
        await queueDeclarationForSync({ workerId: auth.currentUser?.uid ?? '', ...payload });
        setOfflineNotice('Saved on this device — it will sync automatically when you reconnect.');
        await refreshQueue();
      } catch {
        setError('Submit failed. Please check your connection and try again.');
      } finally {
        setSubmitting(false);
      }
    }
  }

  // AI pack-matching (additive): POSTs the Step 1 context to /api/rpl/match and
  // maps RPLPackMatch[] onto this page's NSQFMatchResult[] state. Score
  // heuristic (documented): the API returns matches pre-ranked best-first, so
  // the 1st/2nd/3rd mapped packs get 90/80/70. suggestedUnits are filtered to
  // real unit names with a fallback to all units; raw matches are stashed to
  // localStorage['rpl:aiMatches'] for the result page. On ANY failure the
  // keyword matches are kept and a visible note explains that AI ranking was
  // unavailable (never blank, never silent).
  async function findMatchingQualifications() {
    setAiMatching(true);
    setAiMatchNote(null);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) return;
      const years = Number(yearsExperience);
      const res = await fetch('/api/rpl/match', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declarationText: `${trade}, ${yearsExperience} years experience, ${sector}, ${employerType}`,
          trade,
          yearsExperience: Number.isFinite(years) ? years : 0,
        }),
      });
      const matchBody = (await res.json().catch(() => null)) as {
        matches?: {
          packTitle?: string;
          suggestedUnits?: string[];
        }[];
        aiUsed?: boolean;
      } | null;
      if (!res.ok || !matchBody || !Array.isArray(matchBody.matches)) {
        setAiMatchNote('AI matching failed — showing keyword matches instead.');
        return;
      }
      if (matchBody.aiUsed === false) {
        setAiMatchNote('AI is unavailable right now — showing keyword matches instead.');
      }
      try {
        localStorage.setItem('rpl:aiMatches', JSON.stringify(matchBody.matches));
      } catch {
        /* storage unavailable — matching still applies for this visit */
      }
      const mapped: NSQFMatchResult[] = [];
      matchBody.matches.slice(0, 3).forEach((m, idx) => {
        const title = typeof m?.packTitle === 'string' ? m.packTitle : '';
        const pack =
          NSQF_PACKS.find((p) => p.title === title) ??
          NSQF_PACKS.find((p) => p.title.toLowerCase() === title.toLowerCase());
        if (!pack) return;
        const score = idx === 0 ? 90 : idx === 1 ? 80 : 70;
        const realUnits = new Set(pack.competencyUnits.map((u) => u.name));
        const filtered = (Array.isArray(m?.suggestedUnits) ? m.suggestedUnits : []).filter(
          (u): u is string => typeof u === 'string' && realUnits.has(u),
        );
        mapped.push({
          pack,
          score,
          matchedUnits:
            filtered.length > 0 ? filtered : pack.competencyUnits.map((u) => u.name),
        });
      });
      if (mapped.length > 0) setMatchedPacks(mapped);
    } catch {
      setAiMatchNote('AI matching failed — showing keyword matches instead.');
    } finally {
      setAiMatching(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Please sign in to submit your experience declaration.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const yearsNum = Number(yearsExperience);
  // P11b: reactive offline flag derived from the useOnlineStatus hook state.
  const isOffline = connectionStatus === 'offline';
  const step1Valid =
    trade.trim().length > 0 &&
    yearsExperience.trim() !== '' &&
    Number.isFinite(yearsNum) &&
    yearsNum >= 0 &&
    yearsNum <= 60;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Declare your experience</h1>
        <p className="text-sm text-muted-foreground">
          Tell us what you can do. A qualified assessor will review it later.
        </p>
      </div>

      {/* Hand-rolled numbered step indicator */}
      <div className="grid grid-cols-4 gap-2" aria-label="Declaration progress">
        {STEPS.map((label, idx) => {
          const status = idx < step ? 'done' : idx === step ? 'active' : 'pending';
          return (
            <div
              key={label}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all',
                status === 'active'
                  ? 'border-primary bg-primary/5'
                  : status === 'done'
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50 bg-muted/20',
              )}
            >
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  status === 'pending'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {status === 'done' ? '✓' : idx + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium leading-tight',
                  status === 'active' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* P11b offline banner (additive): visible only when offline. */}
      {isOffline && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              {"You're offline — your declaration will be saved and submitted when you reconnect."}
              {queueState.total > 0 && ` (${queueState.total} saved on this device)`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* B1: visible offline-queue state — counts, sign-in requirement and a
          manual replay. Records are NEVER dropped silently. */}
      {queueState.total > 0 && (
        <Card className={queueState.needsSignIn > 0 ? 'border-warning/50' : undefined}>
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm text-muted-foreground">
              {queueState.total} declaration{queueState.total === 1 ? '' : 's'} saved on this device
              {queueState.needsSignIn > 0
                ? ' — sign in to sync them.'
                : queueState.errors > 0
                  ? ' — sync failed, still saved.'
                  : isOffline
                    ? ' — waiting to reconnect.'
                    : '.'}
            </p>
            {syncNote && <p className="text-xs text-muted-foreground">{syncNote}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={syncing || isOffline}
                onClick={() => void runQueueSync()}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void refreshQueue()}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* P11b offline-saved notice (additive): shown after queueDeclarationForSync. */}
      {offlineNotice && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{offlineNotice}</p>
          </CardContent>
        </Card>
      )}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal & trade context</CardTitle>
            <CardDescription>Step 1 of 4 — tell us about your work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trade">Trade / occupation</Label>
              <Input
                id="trade"
                placeholder="e.g. Electrician, Plumber, Data Entry Operator"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">Sector</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger id="sector">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="years">Years of experience</Label>
              <Input
                id="years"
                type="number"
                min={0}
                max={60}
                placeholder="e.g. 5"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location (state)</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger id="location">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employer type</Label>
              <RadioGroup value={employerType} onValueChange={setEmployerType}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="emp-informal" value="informal" />
                  <Label htmlFor="emp-informal">Informal</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="emp-formal" value="formal" />
                  <Label htmlFor="emp-formal">Formal</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="emp-self" value="self-employed" />
                  <Label htmlFor="emp-self">Self-employed</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {/* PEER HOOK: the Gemini "Find matching qualifications" button goes
              here — it only needs to call setMatchedPacks(NSQFMatchResult[]). */}
          <Card>
            <CardHeader>
              <CardTitle>Experience declaration</CardTitle>
              <CardDescription>
                Step 2 of 4 — mark each skill honestly. Matching qualifications update as you
                type your trade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="secondary"
                className="w-full"
                disabled={aiMatching}
                onClick={() => void findMatchingQualifications()}
              >
                {aiMatching ? 'Analyzing your experience...' : 'Find matching qualifications'}
              </Button>
              {aiMatchNote && (
                <p role="status" className="mt-2 text-xs text-amber-700">
                  {aiMatchNote}
                </p>
              )}
            </CardContent>
          </Card>
          {matchedPacks.map((m) => (
            <Card key={m.pack.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{m.pack.title}</CardTitle>
                  <Badge variant="secondary">NSQF {m.pack.nsqfLevel}</Badge>
                  {m.score > 0 && <Badge variant="outline">Match {m.score}</Badge>}
                </div>
                <CardDescription>
                  {m.pack.id} · {m.pack.sector} · {m.pack.trade}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {m.pack.competencyUnits.map((u) => (
                  <div key={u.id} className="space-y-2">
                    <Label className="text-sm font-semibold">{u.name}</Label>
                    <RadioGroup
                      value={marks[m.pack.id]?.[u.id] ?? 'never'}
                      onValueChange={(v) => setMark(m.pack.id, u.id, v as DeclarationMark)}
                    >
                      {MARKS.map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem
                            id={`${m.pack.id}-${u.id}-${opt.value}`}
                            value={opt.value}
                          />
                          <Label htmlFor={`${m.pack.id}-${u.id}-${opt.value}`}>
                            {opt.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <Separator />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Evidence summary</CardTitle>
              <CardDescription>
                Step 3 of 4 — describe when and where you did this work (max 500 characters
                each).
              </CardDescription>
            </CardHeader>
          </Card>
          {evidencePacks.length === 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  No marked skills yet. Go back and mark at least one skill as “I can do this”
                  or “I have done this before” to add evidence.
                </p>
              </CardContent>
            </Card>
          )}
          {evidencePacks.map((m) => {
            const value = evidence[m.pack.id] ?? '';
            return (
              <Card key={m.pack.id}>
                <CardHeader>
                  <CardTitle className="text-base">{m.pack.title}</CardTitle>
                  <CardDescription>{m.pack.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor={`evidence-${m.pack.id}`}>
                    Describe when you did this and where.
                  </Label>
                  <Textarea
                    id={`evidence-${m.pack.id}`}
                    maxLength={500}
                    placeholder="e.g. Wired three homes in Pune in 2023 under contractor…"
                    value={value}
                    onChange={(e) => setEvidence((prev) => ({ ...prev, [m.pack.id]: e.target.value }))}
                  />
                  <p className="text-right text-xs text-muted-foreground">{value.length}/500</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & submit</CardTitle>
            <CardDescription>Step 4 of 4 — check everything before submitting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1 text-sm">
              <p>
                <span className="font-semibold">Trade:</span> {trade || '—'}
              </p>
              <p>
                <span className="font-semibold">Sector:</span> {sector || '—'}
              </p>
              <p>
                <span className="font-semibold">Experience:</span>{' '}
                {yearsExperience ? `${yearsExperience} years` : '—'}
              </p>
              <p>
                <span className="font-semibold">Location:</span> {location || '—'}
              </p>
              <p>
                <span className="font-semibold">Employer:</span> {employerType || '—'}
              </p>
            </div>
            <Separator />
            {matchedPacks.map((m) => {
              const units = m.pack.competencyUnits;
              const counts: Record<DeclarationMark, number> = {
                'can-do': 0,
                done: 0,
                never: 0,
              };
              for (const u of units) {
                const mark = marks[m.pack.id]?.[u.id] ?? 'never';
                counts[mark] += 1;
              }
              return (
                <div key={m.pack.id} className="space-y-1 text-sm">
                  <p className="font-semibold">
                    {m.pack.title}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({counts['can-do']} can-do · {counts.done} done · {counts.never} never)
                    </span>
                  </p>
                  {(evidence[m.pack.id] ?? '').length > 0 && (
                    <p className="text-muted-foreground">
                      Evidence ({(evidence[m.pack.id] ?? '').length}/500):{' '}
                      {evidence[m.pack.id]}
                    </p>
                  )}
                </div>
              );
            })}
            <Separator />
            <p className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">
              This declaration will be reviewed by a qualified assessor — it does not replace
              assessment
            </p>
            <Button
              className="w-full"
              disabled={submitting || !step1Valid || !hasClaimedSkill}
              onClick={() => void submitDeclaration(buildPayload())}
            >
              {submitting ? 'Submitting…' : 'Submit declaration'}
            </Button>
            {(!step1Valid || !hasClaimedSkill) && (
              <p className="text-xs text-muted-foreground">
                {!step1Valid
                  ? 'Trade and years of experience (0–60) are required before submitting.'
                  : 'Mark at least one skill as “I can do this” or “I have done this before” before submitting.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 3 && (
          <Button
            className="flex-1"
            disabled={(step === 0 && !step1Valid) || (step === 1 && !hasClaimedSkill)}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        )}
      </div>

      {/* B1: inline reason the Next button is blocked on step 2. */}
      {step === 1 && !hasClaimedSkill && (
        <p role="alert" className="text-xs text-destructive">
          Mark at least one skill as “I can do this” or “I have done this before” to continue.
        </p>
      )}
    </main>
  );
}
