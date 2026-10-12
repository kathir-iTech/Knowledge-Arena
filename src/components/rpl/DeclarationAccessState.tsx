'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

/**
 * SIH-26242 Part 1.5 — designed state for a 403/404 from the status API.
 *
 * The server is RIGHT to refuse (the reference code belongs to another
 * worker); what was wrong is that the UI printed the raw API string
 * "Forbidden". This replaces it with an explanation and two ways forward.
 */
export function DeclarationAccessState({ referenceCode }: { referenceCode?: string | null }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-start gap-3">
        <Compass className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <CardTitle>This declaration isn&apos;t linked to your account</CardTitle>
          <CardDescription>
            {referenceCode
              ? `Reference ${referenceCode} belongs to another worker or assessor, so it can't be opened here.`
              : 'That reference code belongs to another worker or assessor, so it can’t be opened here.'}{' '}
            Sign in as the person who declared it, or start your own declaration.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/rpl">Go to my workspace</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/rpl/declare">Start a new declaration</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
