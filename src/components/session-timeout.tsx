'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, AlertTriangle } from 'lucide-react';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;

export function SessionTimeout() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => resetTimer();
    events.forEach(ev => window.addEventListener(ev, handleActivity));

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = SESSION_TIMEOUT_MS - elapsed;

      if (remaining <= 0) {
        logout();
        return;
      }

      if (remaining <= WARNING_BEFORE_MS && !showWarning) {
        setShowWarning(true);
      }

      if (showWarning) {
        setTimeLeft(Math.ceil(remaining / 1000));
      }
    }, 1000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleActivity));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, logout, resetTimer, showWarning]);

  if (!user) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => { if (!open) resetTimer(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <DialogTitle>Session Expiring</DialogTitle>
          </div>
          <DialogDescription>
            Your session will expire due to inactivity.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 py-4">
          <Clock className="w-5 h-5 text-warning" />
          <span className="text-2xl font-bold tabular-nums">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={logout}>Log Out</Button>
          <Button onClick={resetTimer}>Stay Signed In</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
