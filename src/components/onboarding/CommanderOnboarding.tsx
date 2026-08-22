'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Swords, Sparkles, PencilRuler, Zap } from 'lucide-react';

export function CommanderOnboarding() {
  const { user } = useAuth();
  const { firestore } = useFirebase();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || !firestore || user.role !== 'commander' || checked) return;
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
        const q = query(collection(firestore, 'quizzes'), where('created_by', '==', user.id), limit(1));
        const s = await getDocs(q);
        if (!s.empty) {
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

  if (step === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" /> Welcome, Commander
              </DialogTitle>
              <DialogDescription>
                Your arena awaits. Create and command live battles for your Gladiators in seconds.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="rounded-[12px] bg-primary/5 border border-primary/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="w-4 h-4 text-primary" /> What you can do
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                  <li>Forge arenas manually or from PDFs with AI</li>
                  <li>Share a 6-digit room code — Gladiators join instantly</li>
                  <li>Command live: advance questions, pause, analyze</li>
                </ul>
              </div>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between w-full">
              <Button variant="ghost" onClick={handleDismiss}>Skip</Button>
              <Button onClick={() => setStep(2)}>Next — Forge Arena</Button>
            </DialogFooter>
          </>
        )}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PencilRuler className="w-5 h-5 text-primary" /> Forge your first Arena
              </DialogTitle>
              <DialogDescription>
                Create a quiz, add questions, then share the room code with your Gladiators.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[12px] border p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold"><PencilRuler className="w-4 h-4 text-primary" /> Manual</div>
                  <p className="text-xs text-muted-foreground">Write questions yourself.</p>
                </div>
                <div className="rounded-[12px] border p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold"><Zap className="w-4 h-4 text-accent" /> AI Forge</div>
                  <p className="text-xs text-muted-foreground">Upload a PDF → AI generates questions.</p>
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="w-full sm:w-auto">Back</Button>
              <Button asChild className="w-full sm:flex-1" onClick={() => markComplete()}>
                <Link href="/create-quiz">Forge your first Arena</Link>
              </Button>
            </DialogFooter>
            <div className="text-center">
              <button onClick={handleDismiss} className="text-xs text-muted-foreground hover:text-foreground">Dismiss — I&apos;ll do this later</button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
