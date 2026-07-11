"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX, HelpCircle } from "lucide-react";

export default function CheatingDetectedPage() {
  return (
    <main className="loading-screen flex-col text-center">
      <ShieldX className="w-24 h-24 text-destructive mb-6 crystal-float" />
      <h1 className="text-4xl font-headline text-destructive mb-2">Access Denied</h1>
      <p className="text-xl text-muted-foreground mb-2 max-w-md">
        Your attempt to join was denied.
      </p>
      <div className="flex items-center gap-2 bg-destructive/10 px-4 py-2 rounded-full text-sm mb-8">
        <HelpCircle className="w-4 h-4 text-destructive" />
        <span>This can happen if you try to join a room you are not authorized to access.</span>
      </div>
      <p className="text-muted-foreground mb-8 max-w-md">
        Please contact your teacher if you believe this is an error. You can return to the dashboard and try again.
      </p>
      <Link href="/" passHref>
        <Button variant="outline" size="lg">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
