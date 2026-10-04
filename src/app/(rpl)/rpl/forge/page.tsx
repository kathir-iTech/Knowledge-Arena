'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import type { RPLAssessmentPack } from '@/lib/rpl/types';

const MIN_PDF_BYTES = 50 * 1024;

type EditablePack = Omit<RPLAssessmentPack, 'items'> & {
  items: Array<{
    id: string;
    unitId: string;
    taskDescription: string;
    mapsToCriterion: string;
    difficulty: 1 | 2 | 3 | 4;
    assessmentMethod: 'observation' | 'product evidence' | 'oral questioning';
  }>;
};

export default function RplForgePage() {
  // Authoritative page-level guard (a peer agent builds (rpl)/rpl/layout.tsx
  // in parallel; this guard stays authoritative).
  const { user, isLoading } = useAuth();
  const { auth } = useFirebase();

  const [file, setFile] = useState<File | null>(null);
  const [packId, setPackId] = useState(NSQF_PACKS[0].id);
  const [trade, setTrade] = useState(NSQF_PACKS[0].trade);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'review' | 'saving' | 'saved'>('idle');
  const [pack, setPack] = useState<EditablePack | null>(null);
  const [wasCached, setWasCached] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
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
            <CardDescription>Only commanders and executives can use the RPL Forge.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  function pickFile(next: File | null) {
    setError(null);
    setTemplateId(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) {
      setFile(null);
      setError('Only PDF files are accepted (application/pdf).');
      return;
    }
    if (next.size < MIN_PDF_BYTES) {
      setFile(null);
      setError(
        `PDF too small (${(next.size / 1024).toFixed(1)}KB). Minimum is 50KB — please upload the full official qualification pack PDF.`,
      );
      return;
    }
    setFile(next);
  }

  async function upload() {
    setError(null);
    setTemplateId(null);
    if (!file) {
      setError('Choose a PDF file first.');
      return;
    }
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    setStatus('uploading');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('packId', packId);
      form.append('trade', trade);
      const res = await fetch('/api/rpl/forge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = (await res.json().catch(() => null)) as {
        pack?: EditablePack;
        cached?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.pack) {
        setStatus('idle');
        setError(typeof body?.error === 'string' ? body.error : 'Forge failed. Please try again.');
        return;
      }
      setPack(body.pack);
      setWasCached(body.cached === true);
      setStatus('review');
    } catch {
      setStatus('idle');
      setError('Upload failed. Please check your connection and try again.');
    }
  }

  function editItem(itemId: string, taskDescription: string) {
    setPack((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, taskDescription } : i)) } : prev,
    );
  }

  function deleteItem(itemId: string) {
    setPack((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev));
  }

  async function saveFinalized() {
    setError(null);
    if (!pack) return;
    if (pack.items.length === 0) {
      setError('Add at least one task item before saving.');
      return;
    }
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setError('You are not signed in. Please sign in again.');
      return;
    }
    setStatus('saving');
    try {
      const res = await fetch('/api/rpl/forge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalize: true, pack }),
      });
      const body = (await res.json().catch(() => null)) as { templateId?: string; error?: string } | null;
      if (!res.ok || !body?.templateId) {
        setStatus('review');
        setError(typeof body?.error === 'string' ? body.error : 'Save failed. Please try again.');
        return;
      }
      setTemplateId(body.templateId);
      setStatus('saved');
    } catch {
      setStatus('review');
      setError('Save failed. Please check your connection and try again.');
    }
  }

  const units = pack?.units ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Upload an official NCVET qualification pack PDF
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Text is extracted server-side from the PDF&apos;s text layer and forged into practical RPL
          assessment tasks. Scanned/image-only PDFs are rejected (the main Forge pipeline rejects
          scanned PDFs) — no OCR is performed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qualification pack</CardTitle>
          <CardDescription>
            Available packs: {NSQF_PACKS.map((p) => p.id).join(', ')}. Minimum file size 50KB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rpl-pack-id">Pack ID</Label>
              <Input
                id="rpl-pack-id"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                placeholder="ELE/Q1301"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rpl-trade">Trade</Label>
              <Input
                id="rpl-trade"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                placeholder="Electrician"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rpl-pdf">PDF file</Label>
            <Input
              id="rpl-pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button onClick={upload} disabled={!file || status === 'uploading'}>
            {status === 'uploading' ? 'Forging…' : 'Forge assessment pack'}
          </Button>
        </CardContent>
      </Card>

      {pack && status !== 'idle' && status !== 'uploading' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Review: {pack.packId} — {pack.trade}
              {wasCached && <span className="ml-2 text-xs font-normal text-muted-foreground">(from cache)</span>}
            </CardTitle>
            <CardDescription>
              {units.length} unit(s), {pack.items.length} practical task item(s). Edit any task below,
              delete ones that don&apos;t apply, then save the finalized pack.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {units.map((unit) => {
              const unitItems = pack.items.filter((i) => i.unitId === unit.id);
              return (
                <section key={unit.id} className="space-y-3 rounded-[12px] border border-input p-4">
                  <h2 className="text-base font-medium text-foreground">
                    {unit.id} — {unit.name}
                  </h2>
                  {unit.performanceCriteria.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {unit.performanceCriteria.map((criterion) => (
                        <li key={criterion}>{criterion}</li>
                      ))}
                    </ul>
                  )}
                  {unitItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No task items for this unit.</p>
                  ) : (
                    unitItems.map((item) => (
                      <div key={item.id} className="space-y-2 rounded-[12px] bg-secondary p-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {item.assessmentMethod} · difficulty {item.difficulty} · maps to:{' '}
                            {item.mapsToCriterion}
                          </span>
                          <Button variant="destructive" size="sm" onClick={() => deleteItem(item.id)}>
                            Delete
                          </Button>
                        </div>
                        <Textarea
                          aria-label={`Task ${item.id}`}
                          value={item.taskDescription}
                          onChange={(e) => editItem(item.id, e.target.value)}
                        />
                      </div>
                    ))
                  )}
                </section>
              );
            })}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button onClick={saveFinalized} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save finalized pack'}
            </Button>
            {status === 'saved' && templateId && (
              <p className="text-sm text-muted-foreground">
                Saved as template <span className="font-medium text-foreground">{templateId}</span>.
                Templates carry isTemplate:true and are excluded from assessor queues.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
