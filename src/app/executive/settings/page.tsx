'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function ExecutiveSettingsPage() {
  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-page-title font-headline tracking-tight">Settings</h1>
        <p className="text-base text-muted-foreground">Platform configuration and preferences.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Settings className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground">Settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
