"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function CheatingDetectedPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 text-center animate-in gap-5">
      <ShieldX className="w-16 h-16 text-destructive" />
      <div className="space-y-2">
        <h1 className="text-2xl font-headline tracking-tight text-destructive">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your attempt to join was denied. This can happen if you try to join a room you are not authorized to access.
        </p>
      </div>
      <p className="text-sm text-muted-foreground max-w-sm">
        Please contact your teacher if you believe this is an error.
      </p>
      <Link href="/" passHref>
        <Button variant="outline">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
