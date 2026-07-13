'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

export default function CommanderManagementPage() {
  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-page-title font-headline tracking-tight">Commanders</h1>
        <p className="text-base text-muted-foreground">Manage platform commanders and their permissions.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground mb-4">No commanders to manage yet.</p>
          <Button asChild variant="outline"><Link href="/executive/dashboard">Back to Dashboard</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
