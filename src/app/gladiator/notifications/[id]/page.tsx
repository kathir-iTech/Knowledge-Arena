'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  Bell, UserPlus, UserCheck, Swords, Zap, Megaphone, MessageSquare,
  AlertTriangle, AlertCircle, Shield, BookOpen, Lock, CheckCheck, Trash2, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationDetail {
  id: string;
  type: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: number | null;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  commander_request: { icon: UserPlus, color: 'text-warning bg-warning/10 dark:bg-warning/20' },
  gladiator_registration: { icon: UserCheck, color: 'text-success bg-success/10 dark:bg-success/20' },
  battle_completed: { icon: Swords, color: 'text-success bg-success/10 dark:bg-success/20' },
  ai_import_completed: { icon: Zap, color: 'text-accent bg-accent/15 dark:bg-accent/20' },
  new_announcement: { icon: Megaphone, color: 'text-warning bg-warning/10 dark:bg-warning/20' },
  new_message: { icon: MessageSquare, color: 'text-muted-foreground bg-muted/40' },
  operation_failed: { icon: AlertTriangle, color: 'text-destructive bg-destructive/10 dark:bg-destructive/20' },
  system_warning: { icon: AlertCircle, color: 'text-destructive bg-destructive/10 dark:bg-destructive/20' },
  commander_created: { icon: Shield, color: 'text-primary bg-primary/10 dark:bg-primary/20' },
  commander_disabled: { icon: AlertTriangle, color: 'text-warning bg-warning/10 dark:bg-warning/20' },
  commander_enabled: { icon: UserCheck, color: 'text-success bg-success/10 dark:bg-success/20' },
  password_reset: { icon: Lock, color: 'text-warning bg-warning/10 dark:bg-warning/20' },
  question_added: { icon: BookOpen, color: 'text-warning bg-warning/10 dark:bg-warning/20' },
  question_deleted: { icon: AlertTriangle, color: 'text-destructive bg-destructive/10 dark:bg-destructive/20' },
  arena_created: { icon: Swords, color: 'text-primary bg-primary/10 dark:bg-primary/20' },
  new_arena: { icon: Swords, color: 'text-primary bg-primary/10 dark:bg-primary/20' },
  arena_started: { icon: Zap, color: 'text-primary bg-primary/10 dark:bg-primary/20' },
  arena_completed: { icon: Swords, color: 'text-success bg-success/10 dark:bg-success/20' },
  student_joined: { icon: UserPlus, color: 'text-accent bg-accent/15 dark:bg-accent/20' },
  student_kicked: { icon: AlertCircle, color: 'text-destructive bg-destructive/10 dark:bg-destructive/20' },
  student_unblocked: { icon: UserCheck, color: 'text-success bg-success/10 dark:bg-success/20' },
  settings_updated: { icon: Bell, color: 'text-muted-foreground bg-muted/40' },
  ownership_transferred: { icon: Swords, color: 'text-primary bg-primary/10 dark:bg-primary/20' },
};

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function GladiatorNotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [notification, setNotification] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  const fetchNotification = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotification(data.notification || null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load notification.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [auth, id]);

  useEffect(() => {
    if (!user || !id) return;
    fetchNotification();
  }, [user, id, fetchNotification]);

  const markRead = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [id] }),
      });
      if (res.ok) {
        setNotification(prev => prev ? { ...prev, read: true } : prev);
        toast({ title: 'Marked as read' });
      } else {
        toast({ title: 'Failed to mark as read', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to mark as read', variant: 'destructive' });
    }
  };

  const deleteNotification = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: 'Notification deleted' });
        router.push('/gladiator/notifications');
      } else {
        toast({ title: 'Failed to delete notification', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete notification', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load notification</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Notification not found.'}</p>
            <Button onClick={fetchNotification}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = typeConfig[notification.type] || { icon: Bell, color: 'text-muted-foreground bg-muted/30' };
  const Icon = config.icon;

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-headline tracking-tight">Notification</h1>
            <Badge variant="outline" className="text-[10px] h-5">{notification.type.replace(/_/g, ' ')}</Badge>
            {!notification.read && <Badge variant="destructive" className="text-[10px] h-5">Unread</Badge>}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {formatDate(notification.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {!notification.read && (
            <Button variant="outline" onClick={markRead}>
              <CheckCheck className="w-4 h-4 mr-2" /> Mark as Read
            </Button>
          )}
          <Button variant="destructive" onClick={deleteNotification}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      <Card className="card-hover">
        <CardContent className="p-6 flex items-start gap-4">
          <div className={cn("shrink-0 w-12 h-12 rounded-[12px] flex items-center justify-center", config.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-lg font-headline font-semibold">{notification.title}</h2>
            <p className="text-base text-muted-foreground">{notification.description || 'No description'}</p>
            {notification.link && (
              <Button variant="outline" size="sm" asChild>
                <a href={notification.link}>Open related page</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {notification.metadata && Object.keys(notification.metadata).length > 0 && (
        <Card className="card-hover">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Metadata</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(notification.metadata).map(([key, val]) => (
                <div key={key} className="p-2.5 rounded-[10px] bg-muted/30">
                  <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-sm font-medium truncate">{String(val ?? '—')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
