'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function QuestionBankPage() {
  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-page-title font-headline tracking-tight">Question Bank</h1>
        <p className="text-base text-muted-foreground">Browse and manage the platform question repository.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground">Question bank coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
