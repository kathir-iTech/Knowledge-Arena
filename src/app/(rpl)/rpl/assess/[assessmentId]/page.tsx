'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NSQF_PACKS, type NSQFQualificationPack } from '@/lib/rpl/nsqf-packs';
import type { AssessmentItem, EvidenceImageDoc, RPLAssessmentDoc, RPLWorkerDoc } from '@/lib/rpl/types';
import { deleteEvidence, listEvidenceForUnit, uploadEvidenceImage } from '@/lib/rpl/evidence-upload';

const RUBRIC_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Not demonstrated',
  2: 'Partially demonstrated',
  3: 'Demonstrated with prompting',
  4: 'Demonstrated independently',
};
const RUBRIC_VALUES: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

interface ItemState {
  itemId: string;
  unitId: string;
  unitName: string;
  kind: 'performance' | 'knowledge';
  criterionText: string;
  rubricScore?: 1 | 2 | 3 | 4;
  knowledgePass?: boolean;
  note: string;
  aiProposedScore?: number;
  aiAccepted?: boolean;
}

interface UnitSuggestion {
  proposedScore: 1 | 2 | 3 | 4;
  rationale: string;
}

type AssessmentDetail = Partial<RPLAssessmentDoc> & { id: string };
type WorkerDetail = (Partial<RPLWorkerDoc> & { id?: string }) | null;

function isScore(v: unknown): v is 1 | 2 | 3 | 4 {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
}

function buildInitialItems(
  pack: NSQFQualificationPack,
  assessmentId: string,
  existing: AssessmentItem[],
): ItemState[] {
  const byId = new Map(existing.map((i) => [i.itemId, i]));
  const seen = new Set<string>();
  const out: ItemState[] = [];
  for (const unit of pack.competencyUnits) {
    unit.performanceCriteria.forEach((criterionText, idx) => {
      const itemId = `${unit.id}::p${idx}`;
      seen.add(itemId);
      const prev = byId.get(itemId);
      out.push({
        itemId,
        unitId: unit.id,
        unitName: unit.name,
        kind: 'performance',
        criterionText,
        rubricScore: prev && isScore(prev.rubricScore) ? prev.rubricScore : undefined,
        note: typeof prev?.note === 'string' ? prev.note : '',
        aiProposedScore: typeof prev?.aiProposedScore === 'number' ? prev.aiProposedScore : undefined,
        aiAccepted: prev?.aiAccepted === true,
      });
    });
    unit.knowledgeCriteria.forEach((criterionText, idx) => {
      const itemId = `${unit.id}::k${idx}`;
      seen.add(itemId);
      const prev = byId.get(itemId);
      out.push({
        itemId,
        unitId: unit.id,
        unitName: unit.name,
        kind: 'knowledge',
        criterionText,
        knowledgePass: typeof prev?.knowledgePass === 'boolean' ? prev.knowledgePass : undefined,
        note: typeof prev?.note === 'string' ? prev.note : '',
        aiProposedScore: typeof prev?.aiProposedScore === 'number' ? prev.aiProposedScore : undefined,
        aiAccepted: prev?.aiAccepted === true,
      });
    });
  }
  // Keep orphan items (e.g. pack edited after a draft was saved) so nothing is lost.
  for (const prev of existing) {
    if (!prev.itemId || seen.has(prev.itemId)) continue;
    out.push({
      itemId: prev.itemId,
      unitId: typeof prev.unitId === 'string' ? prev.unitId : '',
      unitName: typeof prev.unitName === 'string' ? prev.unitName : '',
      kind: prev.kind === 'knowledge' ? 'knowledge' : 'performance',
      criterionText: typeof prev.criterionText === 'string' ? prev.criterionText : prev.itemId,
      rubricScore: isScore(prev.rubricScore) ? prev.rubricScore : undefined,
      knowledgePass: typeof prev.knowledgePass === 'boolean' ? prev.knowledgePass : undefined,
      note: typeof prev.note === 'string' ? prev.note : '',
      aiProposedScore: typeof prev.aiProposedScore === 'number' ? prev.aiProposedScore : undefined,
      aiAccepted: prev.aiAccepted === true,
    });
  }
  void assessmentId;
  return out;
}

export default function RplAssessScoringPage() {
  // Dynamic-route params mirror src/app/executive/commanders/[uid]/page.tsx.
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;
  // Authoritative page-level guard (commander-or-executive; the global (rpl)
  // layout guard also covers /rpl/assess* but this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [worker, setWorker] = useState<WorkerDetail>(null);
  const [pack, setPack] = useState<NSQFQualificationPack | null>(null);
  const [items, setItems] = useState<ItemState[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, UnitSuggestion>>({});
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'draft' | 'submitted'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [evidenceByUnit, setEvidenceByUnit] = useState<Record<string, EvidenceImageDoc[]>>({});
  const [evidenceUploading, setEvidenceUploading] = useState<Record<string, boolean>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'commander' && user.role !== 'executive') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (isLoading || !user || !assessmentId) return;
    if (user.role !== 'commander' && user.role !== 'executive') return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token) {
          if (!cancelled) {
            setError('You are not signed in. Please sign in again.');
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/rpl/assess/${encodeURIComponent(assessmentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as {
          assessment?: AssessmentDetail;
          items?: AssessmentItem[];
          worker?: WorkerDetail;
          pack?: NSQFQualificationPack | null;
          error?: string;
        } | null;
        if (!res.ok || !body?.assessment) {
          if (!cancelled) {
            setError(typeof body?.error === 'string' ? body.error : 'Failed to load assessment.');
            setLoading(false);
          }
          return;
        }
        if (cancelled) return;
        const detail = body.assessment;
        const detailItems = body.items ?? [];
        const detailWorker = body.worker ?? null;
        const detailPackId = typeof detail.packId === 'string' ? detail.packId : '';
        const resolvedPack =
          body.pack ?? NSQF_PACKS.find((p) => p.id === detailPackId) ?? null;
        setAssessment(detail);
        setWorker(detailWorker);
        setPack(resolvedPack);
        if (resolvedPack) {
          setItems(buildInitialItems(resolvedPack, assessmentId, detailItems));
          const open: Record<string, boolean> = {};
          for (const u of resolvedPack.competencyUnits) open[u.id] = true;
          setExpanded(open);
        } else {
          setItems([]);
        }
        setNotes(typeof detail.notes === 'string' ? detail.notes : '');
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Failed to load assessment. Please check your connection.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth, assessmentId]);

  useEffect(() => {
    if (isLoading || !user || !assessmentId || !pack) return;
    if (user.role !== 'commander' && user.role !== 'executive') return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token || cancelled) return;
        const results = await Promise.all(
          pack.competencyUnits.map(async (u) => {
            try {
              const docs = await listEvidenceForUnit(assessmentId, u.id, token);
              return [u.id, docs] as const;
            } catch {
              return [u.id, [] as EvidenceImageDoc[]] as const;
            }
          }),
        );
        if (cancelled) return;
        const next: Record<string, EvidenceImageDoc[]> = {};
        for (const [unitId, docs] of results) next[unitId] = docs;
        setEvidenceByUnit(next);
      } catch {
        // Evidence is optional; scoring must keep working.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, auth, assessmentId, pack]);

  const declarationText = useMemo(() => {
    const w = worker as (Partial<RPLWorkerDoc> & { declaration?: { declarationText?: string } }) | null;
    return typeof w?.declaration?.declarationText === 'string' ? w.declaration.declarationText : '';
  }, [worker]);

  const completion = useMemo(() => {
    const total = items.length;
    if (total === 0) return { scored: 0, total: 0, pct: 0 };
    const scored = items.filter((i) =>
      i.kind === 'performance' ? typeof i.rubricScore !== 'undefined' : typeof i.knowledgePass !== 'undefined',
    ).length;
    return { scored, total, pct: Math.round((scored / total) * 100) };
  }, [items]);

  function setPerformanceScore(itemId: string, value: 1 | 2 | 3 | 4) {
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === itemId
          ? {
              ...i,
              rubricScore: value,
              // Manual edits after a suggestion are assessor overrides, not accepts.
              aiAccepted: i.aiProposedScore === value ? i.aiAccepted : false,
            }
          : i,
      ),
    );
  }

  function setKnowledge(itemId: string, value: boolean) {
    setItems((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, knowledgePass: value } : i)));
  }

  function setNote(itemId: string, value: string) {
    setItems((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, note: value } : i)));
  }

  function toggleUnit(unitId: string) {
    setExpanded((prev) => ({ ...prev, [unitId]: !(prev[unitId] ?? true) }));
  }

  async function proposeForUnit(unitId: string, unitName: string, performanceCriteria: string[]) {
    setError(null);
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    setSuggesting((prev) => ({ ...prev, [unitId]: true }));
    try {
      const res = await fetch('/api/rpl/assess/suggest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ declarationText, unitId, unitName, performanceCriteria }),
      });
      const body = (await res.json().catch(() => null)) as {
        proposedScore?: unknown;
        rationale?: unknown;
        error?: string;
      } | null;
      if (!res.ok || !body || !isScore(body.proposedScore)) {
        setError(typeof body?.error === 'string' ? body.error : 'AI suggestion failed. Score manually.');
        return;
      }
      const suggestion: UnitSuggestion = {
        proposedScore: body.proposedScore,
        rationale: typeof body.rationale === 'string' ? body.rationale : '',
      };
      setSuggestions((prev) => ({ ...prev, [unitId]: suggestion }));
      // Greyed-out pre-fill: stage the proposal on unscored rows without accepting.
      setItems((prev) =>
        prev.map((i) =>
          i.unitId === unitId && i.kind === 'performance' && typeof i.rubricScore === 'undefined'
            ? { ...i, aiProposedScore: suggestion.proposedScore, aiAccepted: false }
            : i,
        ),
      );
    } catch {
      setError('AI suggestion failed. Score manually.');
    } finally {
      setSuggesting((prev) => ({ ...prev, [unitId]: false }));
    }
  }

  function acceptSuggestion(unitId: string) {
    const suggestion = suggestions[unitId];
    if (!suggestion) return;
    setItems((prev) =>
      prev.map((i) =>
        i.unitId === unitId && i.kind === 'performance'
          ? {
              ...i,
              rubricScore: suggestion.proposedScore,
              aiProposedScore: suggestion.proposedScore,
              aiAccepted: true,
            }
          : i,
      ),
    );
  }

  function dismissSuggestion(unitId: string) {
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
  }

  async function handleEvidenceSelect(unitId: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    const wid = (
      ((worker as unknown as { workerId?: string } | null)?.workerId ?? assessment?.workerId ?? '') as string
    ).trim();
    if (!wid) {
      setError('Worker reference is missing; reload and try again.');
      return;
    }
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls((prev) => ({ ...prev, [unitId]: [...(prev[unitId] ?? []), previewUrl] }));
    setEvidenceUploading((prev) => ({ ...prev, [unitId]: true }));
    try {
      await uploadEvidenceImage(file, wid, unitId, assessmentId, token);
      const docs = await listEvidenceForUnit(assessmentId, unitId, token);
      setEvidenceByUnit((prev) => ({ ...prev, [unitId]: docs }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evidence upload failed. Please try again.');
    } finally {
      setEvidenceUploading((prev) => ({ ...prev, [unitId]: false }));
      setPreviewUrls((prev) => ({
        ...prev,
        [unitId]: (prev[unitId] ?? []).filter((u) => u !== previewUrl),
      }));
      URL.revokeObjectURL(previewUrl);
    }
  }

  async function handleEvidenceDelete(unitId: string, imageId: string) {
    if (!window.confirm('Delete this evidence image?')) return;
    setError(null);
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    try {
      await deleteEvidence(imageId, assessmentId, token);
      setEvidenceByUnit((prev) => ({
        ...prev,
        [unitId]: (prev[unitId] ?? []).filter((e) => e.imageId !== imageId),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete evidence.');
    }
  }

  async function save(status: 'draft' | 'submitted') {
    if (!assessment) return;
    setError(null);
    setSavedAt(null);
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    if (status === 'submitted' && completion.scored < completion.total) {
      setError(`Cannot submit: ${completion.total - completion.scored} item(s) still unscored.`);
      return;
    }
    setSaving(status);
    try {
      const payloadItems: AssessmentItem[] = items.map((i) => {
        const base: AssessmentItem = {
          itemId: i.itemId,
          assessmentId,
          unitId: i.unitId,
          unitName: i.unitName,
          kind: i.kind,
          criterionText: i.criterionText,
        };
        if (typeof i.rubricScore !== 'undefined') base.rubricScore = i.rubricScore;
        if (i.note.trim()) base.note = i.note.trim().slice(0, 200);
        if (typeof i.knowledgePass !== 'undefined') base.knowledgePass = i.knowledgePass;
        if (typeof i.aiProposedScore === 'number') base.aiProposedScore = i.aiProposedScore;
        if (typeof i.aiAccepted === 'boolean') base.aiAccepted = i.aiAccepted;
        return base;
      });
      const res = await fetch('/api/rpl/assess', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          workerId: assessment.workerId,
          packId: assessment.packId,
          items: payloadItems,
          status,
          ...(notes.trim() ? { notes: notes.trim().slice(0, 200) } : {}),
          ...(typeof assessment.workerName === 'string' ? { workerName: assessment.workerName } : {}),
          ...(typeof assessment.referenceCode === 'string'
            ? { referenceCode: assessment.referenceCode }
            : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSaving('idle');
        setError(typeof body?.error === 'string' ? body.error : 'Save failed. Please try again.');
        return;
      }
      setSaving('idle');
      setSavedAt(status === 'draft' ? 'Draft saved.' : 'Assessment submitted.');
      if (status === 'submitted') {
        router.push('/rpl/assess');
      }
    } catch {
      setSaving('idle');
      setError('Save failed. Please check your connection and try again.');
    }
  }

  if (isLoading || loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Loading assessment…</p>
      </main>
    );
  }
  const role = user?.role;
  if (!user || (role !== 'commander' && role !== 'executive')) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only commanders and executives can score assessments.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  if (!assessment || !pack) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Assessment unavailable</CardTitle>
            <CardDescription>{error ?? 'This assessment could not be loaded.'}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const w = worker as (Partial<RPLWorkerDoc> & { id?: string }) | null;
  const workerName =
    w?.name || (typeof assessment.workerName === 'string' ? assessment.workerName : '') || 'Unknown worker';
  const referenceCode =
    w?.assessmentReferenceCode ||
    (typeof assessment.referenceCode === 'string' ? assessment.referenceCode : '') ||
    '—';

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 pb-32">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{workerName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reference: {referenceCode} · {pack.title} (NSQF Level {pack.nsqfLevel})
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={assessment.status === 'draft' ? 'warning' : 'success'}>
            {assessment.status === 'draft' ? 'draft' : 'submitted'}
          </Badge>
          {typeof assessment.aiSuggestionUsed === 'boolean' && assessment.aiSuggestionUsed ? (
            <Badge variant="secondary">AI-assisted</Badge>
          ) : null}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {pack.competencyUnits.map((unit) => {
        const unitItems = items.filter((i) => i.unitId === unit.id);
        const suggestion = suggestions[unit.id];
        const isOpen = expanded[unit.id] ?? true;
        return (
          <Card key={unit.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>
                    {unit.id} — {unit.name}
                  </CardTitle>
                  <CardDescription>
                    {unitItems.filter((i) =>
                      i.kind === 'performance'
                        ? typeof i.rubricScore !== 'undefined'
                        : typeof i.knowledgePass !== 'undefined',
                    ).length}
                    /{unitItems.length} scored
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleUnit(unit.id)}>
                  {isOpen ? 'Collapse' : 'Expand'}
                </Button>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-5">
                {/* UnitActions: single extensible action row per unit (a later agent adds "Add evidence" here). */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!suggesting[unit.id]}
                    onClick={() => proposeForUnit(unit.id, unit.name, unit.performanceCriteria)}
                  >
                    {suggesting[unit.id] ? 'Proposing…' : 'AI-propose score'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!evidenceUploading[unit.id]}
                    onClick={() => document.getElementById(`evidence-input-${unit.id}`)?.click()}
                  >
                    {evidenceUploading[unit.id] ? 'Uploading…' : 'Add evidence'}
                  </Button>
                  <input
                    id={`evidence-input-${unit.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleEvidenceSelect(unit.id, e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                {(previewUrls[unit.id]?.length ?? 0) > 0 ||
                (evidenceByUnit[unit.id]?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(previewUrls[unit.id] ?? []).map((src) => (
                      <img
                        key={src}
                        src={src}
                        alt={`Evidence preview for ${unit.id}`}
                        className="h-20 w-20 rounded-md border border-input object-cover opacity-70"
                      />
                    ))}
                    {(evidenceByUnit[unit.id] ?? []).map((ev) => (
                      <div key={ev.imageId} className="flex flex-col items-center gap-1">
                        <img
                          src={ev.dataUrl}
                          alt={`Evidence for ${unit.id}`}
                          className="h-20 w-20 rounded-md border border-input object-cover"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleEvidenceDelete(unit.id, ev.imageId)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {suggestion && (
                  <div className="space-y-2 rounded-[12px] border border-dashed border-input bg-secondary/50 p-3 opacity-70">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      AI-proposed — assessor must verify and confirm
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Proposed score: {suggestion.proposedScore} ({RUBRIC_LABELS[suggestion.proposedScore]})
                    </p>
                    {suggestion.rationale ? (
                      <p className="text-sm text-muted-foreground">{suggestion.rationale}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => acceptSuggestion(unit.id)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => dismissSuggestion(unit.id)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {unit.performanceCriteria.map((criterionText, idx) => {
                    const item = unitItems.find(
                      (i) => i.kind === 'performance' && i.criterionText === criterionText,
                    ) ?? unitItems.filter((i) => i.kind === 'performance')[idx];
                    if (!item) return null;
                    const staged = typeof item.rubricScore === 'undefined' && typeof item.aiProposedScore === 'number';
                    return (
                      <div key={item.itemId} className="space-y-2 rounded-[12px] border border-input p-3">
                        <p className="text-sm text-foreground">{criterionText}</p>
                        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={criterionText}>
                          {RUBRIC_VALUES.map((value) => (
                            <label
                              key={value}
                              className={`flex cursor-pointer items-center gap-1.5 text-sm ${
                                staged && item.aiProposedScore === value
                                  ? 'text-muted-foreground opacity-60'
                                  : 'text-foreground'
                              }`}
                            >
                              <input
                                type="radio"
                                name={item.itemId}
                                value={value}
                                checked={item.rubricScore === value}
                                onChange={() => setPerformanceScore(item.itemId, value)}
                                className="h-4 w-4"
                              />
                              <span>
                                {value} — {RUBRIC_LABELS[value]}
                                {staged && item.aiProposedScore === value ? ' (AI-proposed)' : ''}
                              </span>
                            </label>
                          ))}
                        </div>
                        {staged ? (
                          <p className="text-xs text-muted-foreground">
                            AI-proposed — assessor must verify and confirm
                          </p>
                        ) : null}
                        <div className="space-y-1">
                          <Label htmlFor={`note-${item.itemId}`} className="text-xs">
                            Assessor note (optional, max 200 chars)
                          </Label>
                          <Input
                            id={`note-${item.itemId}`}
                            value={item.note}
                            maxLength={200}
                            placeholder="Observation note…"
                            onChange={(e) => setNote(item.itemId, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {unit.knowledgeCriteria.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Knowledge criteria</h3>
                    {unit.knowledgeCriteria.map((criterionText, idx) => {
                      const item = unitItems.find(
                        (i) => i.kind === 'knowledge' && i.criterionText === criterionText,
                      ) ?? unitItems.filter((i) => i.kind === 'knowledge')[idx];
                      if (!item) return null;
                      return (
                        <div
                          key={item.itemId}
                          className="flex flex-col gap-2 rounded-[12px] border border-input p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="text-sm text-foreground">{criterionText}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={item.knowledgePass === true ? 'default' : 'outline'}
                              onClick={() => setKnowledge(item.itemId, true)}
                            >
                              Pass
                            </Button>
                            <Button
                              size="sm"
                              variant={item.knowledgePass === false ? 'default' : 'outline'}
                              onClick={() => setKnowledge(item.itemId, false)}
                            >
                              Fail
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Assessor notes</CardTitle>
          <CardDescription>Optional overall note (max 200 chars).</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            maxLength={200}
            placeholder="Overall observation…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t border-input bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Completion: {completion.scored}/{completion.total} ({completion.pct}%)
          </p>
          <div className="flex items-center gap-2">
            {savedAt ? <span className="text-xs text-muted-foreground">{savedAt}</span> : null}
            <Button variant="outline" disabled={saving !== 'idle'} onClick={() => save('draft')}>
              {saving === 'draft' ? 'Saving…' : 'Save draft'}
            </Button>
            <Button disabled={saving !== 'idle'} onClick={() => save('submitted')}>
              {saving === 'submitted' ? 'Submitting…' : 'Submit assessment'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
