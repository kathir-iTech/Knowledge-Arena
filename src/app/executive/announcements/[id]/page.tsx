'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Megaphone, CheckCircle2, AlertTriangle, RefreshCw, Users, User, Clock,
  ArrowLeft, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface AnnouncementDetail {
  id: string;
  text: string;
  senderId?: string | null;
  sender?: { name: string; email: string | null } | null;
  targetRole?: string;
  targetId?: string | null;
  targetCommander?: { uid: string; name: string } | null;
  readBy?: string[];
  readReceipts?: Array<{ uid: string; name: string }>;
  readCount?: number;
  createdAt?: number | null;
  editedAt?: number | null;
}

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function ExecutiveAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [announcement, setAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  const fetchAnnouncement = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/announcements/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncement(data.announcement || null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load announcement.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, id]);

  useEffect(() => {
    if (!user || !id) return;
    fetchAnnouncement();
  }, [user, id, fetchAnnouncement]);

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !announcement) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load announcement</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Announcement not found.'}</p>
            <Button onClick={fetchAnnouncement}><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const targetLabel = announcement.targetRole === 'specific'
    ? `Specific: ${announcement.targetCommander?.name || announcement.targetId || 'unknown'}`
    : announcement.targetRole?.replace(/_/g, ' ') || 'All';

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push('/executive/announcements')} aria-label="Back to announcements" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-page-title font-headline tracking-tight">Announcement</h1>
              <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                <CheckCircle2 className="w-3 h-3 mr-1 text-success" />
                {announcement.readCount ?? 0} read
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Sent by {announcement.sender?.name || 'Unknown'} · {formatDate(announcement.createdAt)}
              {announcement.editedAt ? ` · edited ${formatDate(announcement.editedAt)}` : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchAnnouncement} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Message */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> Message
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-[12px] bg-primary/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Badge variant="outline" className="text-[10px] gap-1.5">
                  <Send className="w-3 h-3 text-primary" /> {announcement.sender?.name || 'Unknown'}
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1.5">
                  <Users className="w-3 h-3 text-primary" /> Target: {targetLabel}
                </Badge>
                {announcement.targetRole === 'specific' && announcement.targetCommander && (
                  <Badge variant="outline" className="text-[10px] gap-1.5">
                    <User className="w-3 h-3 text-primary" /> {announcement.targetCommander.name}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 ml-auto">
                  <Clock className="w-3 h-3" /> Sent {formatDate(announcement.createdAt)}
                </span>
              </div>
              <p className="text-base whitespace-pre-wrap leading-relaxed">{announcement.text || 'No message text'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Read receipts */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" /> Read Receipts ({announcement.readReceipts?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {announcement.readReceipts && announcement.readReceipts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {announcement.readReceipts.map(r => (
                <div key={r.uid} className="flex items-center gap-2.5 p-2.5 rounded-[10px] bg-muted/30">
                  <div className="w-8 h-8 rounded-[8px] bg-success/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                  <span className="text-sm font-medium truncate">{r.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="No Read Receipts" description="No commanders have read this announcement yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
