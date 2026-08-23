'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Users, Check, Sparkles, Copy, Key, AlertCircle } from 'lucide-react';

const COMMANDER_DOMAIN = 'knowledgearena.app';

function validateUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Username is required.';
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
    return null;
  }
  if (trimmed.length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return 'Username can only contain letters, numbers, underscores, hyphens, and dots.';
  return null;
}
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
}

export function ExecutiveOnboarding() {
  const { user } = useAuth();
  const { firestore, auth } = useFirebase();
  const { toast } = useToast();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [checked, setChecked] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [createPassword, setCreatePassword] = useState(generatePassword());
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<{ username?: string; password?: string }>({});
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!user || !firestore || user.role !== 'executive' || checked) return;
    let cancelled = false;
    const check = async () => {
      try {
        const userRef = doc(firestore, 'users', user.id);
        const snap = await getDoc(userRef);
        const data = snap.data() as Record<string, unknown> | undefined;
        if (data?.onboarding_complete === true) {
          if (!cancelled) setChecked(true);
          return;
        }
        // Check if any commanders exist (non-deleted)
        const q = query(collection(firestore, 'users'), where('role', '==', 'commander'), limit(10));
        const s = await getDocs(q);
        const hasCommander = s.docs.some(d => (d.data() as Record<string, unknown>).deleted !== true);
        if (hasCommander) {
          if (!cancelled) setChecked(true);
          return;
        }
        if (!cancelled) {
          setStep(1);
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [user, firestore, checked]);

  const markComplete = async () => {
    if (!user || !firestore) return;
    try {
      const ref = doc(firestore, 'users', user.id);
      await updateDoc(ref, { onboarding_complete: true });
    } catch {}
  };

  const handleDismiss = async () => {
    setStep(0);
    await markComplete();
  };

  const handleNext = () => {
    if (step === 1) setStep(2);
    else if (step === 2 && created) setStep(3);
    else if (step === 3) handleDismiss();
  };

  const getOrGenerateEmail = (input: string): string => {
    if (input.includes('@')) return input;
    return `${input}@${COMMANDER_DOMAIN}`;
  };

  const handleCreate = async () => {
    const usernameError = validateUsername(usernameInput);
    const passwordError = !createPassword || createPassword.length < 6 ? 'Password must be at least 6 characters.' : null;
    const nextErrors: { username?: string; password?: string } = {};
    if (usernameError) nextErrors.username = usernameError;
    if (passwordError) nextErrors.password = passwordError;
    setCreateErrors(nextErrors);
    if (usernameError || passwordError) return;
    setCreating(true);
    try {
      const email = getOrGenerateEmail(usernameInput.trim());
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Session expired. Please reload.');
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password: createPassword, displayName: createDisplayName.trim() || usernameInput.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to create commander.');
      setCreated({ email, password: createPassword });
      toast({ title: 'Commander Created', description: `Email: ${email}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create commander';
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setCreating(false);
    }
  };

  if (!checked) {
    return null;
  }

  if (step === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Welcome to Quorena
              </DialogTitle>
              <DialogDescription>
                You are the Executive — the architect of this arena. Let&apos;s get your platform ready in 30 seconds.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="rounded-[12px] bg-primary/5 border border-primary/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="w-4 h-4 text-primary" /> Your role
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create and manage Commanders, oversee all battles, and maintain the question bank. Commanders will run live arenas for Gladiators.
                </p>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>Step 1: Create your first Commander</li>
                <li>Step 2: Your Commander forges an arena</li>
                <li>Step 3: Gladiators battle live</li>
              </ul>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between w-full">
              <Button variant="ghost" onClick={handleDismiss}>Skip tour</Button>
              <Button onClick={() => setStep(2)}>Next — Create Commander</Button>
            </DialogFooter>
          </>
        )}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Create your first Commander
              </DialogTitle>
              <DialogDescription>
                Commanders run live battles. Create one now — you can add more later from Commanders page.
              </DialogDescription>
            </DialogHeader>
            {!created ? (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="ex-onboard-username">Username or email *</Label>
                  <Input
                    id="ex-onboard-username"
                    value={usernameInput}
                    onChange={e => { setUsernameInput(e.target.value); if (createErrors.username) setCreateErrors(prev => ({ ...prev, username: undefined })); }}
                    placeholder="e.g. commander_smith or smith@college.edu"
                    aria-invalid={!!createErrors.username}
                    disabled={creating}
                  />
                  {createErrors.username && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createErrors.username}</p>}
                  {usernameInput.trim() && !createErrors.username && (
                    <p className="text-xs text-muted-foreground">Login email: <span className="font-mono font-medium text-primary">{getOrGenerateEmail(usernameInput.trim())}</span></p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ex-onboard-display">Display Name</Label>
                  <Input id="ex-onboard-display" value={createDisplayName} onChange={e => setCreateDisplayName(e.target.value)} placeholder="e.g. Dr. Smith" disabled={creating} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ex-onboard-password">Password *</Label>
                  <div className="flex gap-2">
                    <Input id="ex-onboard-password" type="text" value={createPassword} onChange={e => { setCreatePassword(e.target.value); if (createErrors.password) setCreateErrors(prev => ({ ...prev, password: undefined })); }} className="flex-1 font-mono" disabled={creating} />
                    <Button variant="outline" size="sm" onClick={() => { setCreatePassword(generatePassword()); setCreateErrors(prev => ({ ...prev, password: undefined })); }} disabled={creating}><Key className="w-4 h-4" /></Button>
                  </div>
                  {createErrors.password ? <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createErrors.password}</p> : <p className="text-xs text-muted-foreground">Commander will be asked to change this on first login.</p>}
                </div>
                <Button onClick={handleCreate} disabled={creating} className="w-full">
                  {creating ? 'Creating...' : 'Create Commander'}
                </Button>
                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                  <Button variant="ghost" size="sm" onClick={() => setStep(3)}>Skip for now</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-success"><Check className="w-4 h-4" /> Commander created</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono bg-background border rounded px-2 py-1.5 flex-1 truncate">{created.email}</span><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(created.email)}><Copy className="w-3.5 h-3.5 mr-1" />Copy</Button></div>
                    <div className="flex items-center justify-between gap-2"><span className="font-mono bg-background border rounded px-2 py-1.5 flex-1 truncate">{created.password}</span><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(created.password)}><Copy className="w-3.5 h-3.5 mr-1" />Copy</Button></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Share these credentials with the Commander.</p>
                </div>
                <Button onClick={() => setStep(3)} className="w-full">Continue</Button>
              </div>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" /> You&apos;re ready
              </DialogTitle>
              <DialogDescription>
                Your Commander can now forge arenas and invite Gladiators. Monitor everything from your Workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="rounded-[12px] bg-success/5 border border-success/10 p-4 text-sm leading-relaxed">
                Next steps: your Commander logs in → creates an arena at <span className="font-mono font-medium">/create-quiz</span> → shares the 6-digit room code → Gladiators join and battle live.
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleDismiss} className="w-full">Enter Workspace</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
