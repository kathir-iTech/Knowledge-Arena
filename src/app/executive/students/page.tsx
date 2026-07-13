'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function StudentManagementPage() {
  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-page-title font-headline tracking-tight">Students</h1>
        <p className="text-base text-muted-foreground">Manage gladiator accounts and activity.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground">Student management coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
