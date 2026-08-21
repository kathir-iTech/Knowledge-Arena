'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, CheckCheck, Trash2, UserPlus, UserCheck, Swords, Zap,
  Megaphone, MessageSquare, AlertTriangle, AlertCircle, Clock,
  Shield, BookOpen, Lock, RefreshCw, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BulkSelection, BulkSelectionCheckbox } from '@/components/ui/bulk-selection';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: number;
  link?: string;
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

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function GladiatorNotificationsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<{ id: string; createdAt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchNotifications = useCallback(async (reset: boolean) => {
    try {
      if (reset) setError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('You are not signed in.');
        return;
      }
      const params = new URLSearchParams();
      if (!reset && nextCursor) {
        params.set('cursor', nextCursor.id);
        params.set('cursorCreatedAt', String(nextCursor.createdAt));
      }
      const qs = params.toString();
      const res = await fetch(`/api/notifications${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(prev => reset ? (data.notifications || []) : [...prev, ...(data.notifications || [])]);
        setNextCursor(data.nextCursor || null);
        if (reset) setUnreadCount(data.unreadCount || 0);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load notifications.');
        if (reset) setNotifications([]);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      if (reset) setNotifications([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [auth, nextCursor]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    fetchNotifications(false);
  };

  const handleMarkAllRead = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) {
        toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
        return;
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast({ title: 'Failed to delete notification', variant: 'destructive' });
        return;
      }
      const wasUnread = notifications.find(n => n.id === id)?.read === false;
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      toast({ title: 'Failed to delete notification', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await Promise.all(ids.map(id =>
        fetch(`/api/notifications/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      ));
      setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
      setUnreadCount(prev => Math.max(0, prev - ids.filter(id => !notifications.find(n => n.id === id)?.read).length));
      setSelectedIds([]);
    } catch {
      toast({ title: 'Failed to delete notifications', variant: 'destructive' });
    }
  };

  const handleBulkMarkRead = async (ids: string[]) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
        return;
      }
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - ids.filter(id => !notifications.find(n => n.id === id)?.read).length));
      setSelectedIds([]);
    } catch {
      toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: [n.id] }),
          }).catch(() => {});
          setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch {}
    }
    if (n.link) {
      router.push(n.link);
    } else {
      router.push(`/gladiator/notifications/${n.id}`);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <div className="page-container animate-in space-y-4 safe-bottom">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Notifications</h1>
          <p className="text-base text-muted-foreground">Alerts and updates.</p>
        </div>
        <Card className="border-destructive/40">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Failed to load notifications</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => { setLoading(true); fetchNotifications(true); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-headline tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-6 px-2 text-xs">{unreadCount} unread</Badge>
            )}
          </div>
          <p className="text-base text-muted-foreground">Alerts and updates.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="mb-3">
          <BulkSelection
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            allIds={notifications.map(n => n.id)}
            actions={[
              { label: 'Mark Read', icon: CheckCheck, onClick: handleBulkMarkRead, variant: 'default' },
              { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'destructive' },
            ]}
          />
        </div>
      )}

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">No notifications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const config = typeConfig[n.type] || { icon: Bell, color: 'text-muted-foreground bg-muted/30' };
            const Icon = config.icon;
            return (
              <Card
                key={n.id}
                className={cn('cursor-pointer transition-colors hover:bg-accent/30', !n.read && 'border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.04]')}
                onClick={() => handleNotificationClick(n)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span onClick={e => e.stopPropagation()}>
                      <BulkSelectionCheckbox id={n.id} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
                    </span>
                    <div className={cn("shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center", config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {n.link && (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground" aria-hidden="true">
                        <Bell className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); handleDelete(n.id); }}
                      aria-label="Delete notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
