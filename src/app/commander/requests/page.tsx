'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CommanderRequestsPage() {
  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-page-title font-headline tracking-tight">Requests</h1>
        <p className="text-base text-muted-foreground">Submit and track requests for question banks and student reports.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground mb-4">No requests yet.</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline">Request Question Bank</Button>
            <Button variant="outline">Request Student Report</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
