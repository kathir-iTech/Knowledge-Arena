"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Clock, AlertTriangle } from "lucide-react";

export default function KickedPage() {
  let blockedAt: string | null = null;
  let violations = '2';
  try {
    if (typeof window !== 'undefined') {
      blockedAt = sessionStorage.getItem('blocked_at');
      violations = sessionStorage.getItem('blocked_violations') || '2';
      sessionStorage.removeItem('blocked_at');
      sessionStorage.removeItem('blocked_violations');
    }
  } catch {}

  const timeStr = blockedAt ? new Date(parseInt(blockedAt)).toLocaleTimeString() : null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 text-center animate-in gap-6">
      <div className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-destructive/10">
        <ShieldAlert className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-page-title font-headline tracking-tight text-destructive">You Have Been Blocked</h1>
        <p className="text-base text-muted-foreground">
          Malpractice was detected. Fair play is required in the arena.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1.5 rounded-full text-xs font-medium text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Violations: {violations}</span>
        </div>
        {timeStr && (
          <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-1.5 rounded-full text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Blocked at: {timeStr}</span>
          </div>
        )}
      </div>
      <p className="text-base text-muted-foreground max-w-sm">
        Wait for your teacher to review and reset your attempt from the dashboard.
        Refreshing the page will not remove the block.
      </p>
      <Link href="/student/dashboard" passHref>
        <Button variant="outline">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
