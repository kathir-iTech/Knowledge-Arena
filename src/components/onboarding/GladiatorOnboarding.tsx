'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { doc, getDoc, updateDoc, collectionGroup, query, where, limit, getDocs } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Swords, KeyRound, Trophy, X } from 'lucide-react';

export function GladiatorOnboarding() {
  const { user } = useAuth();
  const { firestore } = useFirebase();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || !firestore || user.role !== 'gladiator' || checked) return;
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
        // Check battle history: any participant doc where user_id == uid
        const q = query(collectionGroup(firestore, 'participants'), where('user_id', '==', user.id), limit(1));
        const s = await getDocs(q);
        if (!s.empty) {
          if (!cancelled) setChecked(true);
          return;
        }
        if (!cancelled) {
          setVisible(true);
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [user, firestore, checked]);

  const dismiss = async () => {
    setVisible(false);
    if (!user || !firestore) return;
    try {
      const ref = doc(firestore, 'users', user.id);
      await updateDoc(ref, { onboarding_complete: true });
    } catch {}
  };

  if (!checked) {
    return (
      <Card className="border-primary/15">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <Skeleton className="w-12 h-12 rounded-[14px] shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!visible) return null;

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 shadow-elevation-small">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4 flex-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-[14px] bg-primary/10 shrink-0">
              <Swords className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-base font-headline font-semibold flex items-center gap-2">
                  Welcome to the Arena
                  <Trophy className="w-4 h-4 text-warning" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  You are a Gladiator — your Commander will share a <span className="font-mono font-semibold text-foreground">6-digit room code</span> when a battle is ready.
                </p>
              </div>
              <div className="rounded-[12px] bg-card border p-3 space-y-2.5 text-sm">
                <div className="flex gap-2.5">
                  <div className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-primary/10 shrink-0">
                    <KeyRound className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">How to join</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Enter the room code in &quot;Join Arena&quot; below → tap <strong>Join Battle</strong> → wait in the lobby until your Commander starts.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pl-[2.2rem]">
                  Tip: ask your Commander for the code in class, chat, or email. Codes are 6 characters (e.g. <span className="font-mono">A3K9Q2</span>).
                </p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss" className="shrink-0 h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={dismiss}>Got it — Ready to battle</Button>
        </div>
      </CardContent>
    </Card>
  );
}
