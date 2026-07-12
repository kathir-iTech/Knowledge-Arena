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
    <main className="loading-screen flex-col text-center">
      <ShieldAlert className="w-20 h-20 text-destructive mb-6" />
      <h1 className="text-4xl font-headline text-destructive mb-2">You Have Been Blocked</h1>
      <p className="text-xl text-muted-foreground mb-2 max-w-md">
        Malpractice was detected. Fair play is required in the arena.
      </p>
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 rounded-full text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span>Violations: {violations}</span>
        </div>
        {timeStr && (
          <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full text-sm">
            <Clock className="w-4 h-4" />
            <span>Blocked at: {timeStr}</span>
          </div>
        )}
      </div>
      <p className="text-muted-foreground mb-8 max-w-md">
        Wait for your teacher to review and reset your attempt from the Commander&apos;s Dashboard.
        Refreshing the page will not remove the block.
      </p>
      <Link href="/student/dashboard" passHref>
        <Button variant="outline" size="lg">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
