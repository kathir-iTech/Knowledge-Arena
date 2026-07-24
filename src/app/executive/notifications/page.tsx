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
  Shield, BookOpen, Layers, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  commander_request: { icon: UserPlus, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
  gladiator_registration: { icon: UserCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
  battle_completed: { icon: Swords, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' },
  ai_import_completed: { icon: Zap, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/20' },
  new_announcement: { icon: Megaphone, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20' },
  new_message: { icon: MessageSquare, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20' },
  operation_failed: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
  system_warning: { icon: AlertCircle, color: 'text-red-600 bg-red-50 dark:bg-red-950/20' },
  commander_created: { icon: Shield, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/20' },
  commander_disabled: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
  commander_enabled: { icon: UserCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
  password_reset: { icon: Lock, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20' },
  question_added: { icon: BookOpen, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
  question_deleted: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
  question_set_created: { icon: Layers, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20' },
  arena_created: { icon: Swords, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' },
  arena_started: { icon: Zap, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' },
  arena_completed: { icon: Swords, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
  student_joined: { icon: UserPlus, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
  student_kicked: { icon: AlertCircle, color: 'text-red-600 bg-red-50 dark:bg-red-950/20' },
  student_unblocked: { icon: UserCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
  settings_updated: { icon: Bell, color: 'text-slate-600 bg-slate-50 dark:bg-slate-950/20' },
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ExecutiveNotificationsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) return;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
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
          <p className="text-base text-muted-foreground">Platform alerts and updates.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
        )}
      </div>

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
              <Card key={n.id} className={cn(!n.read && 'border-primary/20 bg-primary/[0.02]')}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={cn("shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center", config.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
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
                  <div className="flex items-center gap-1 shrink-0">
                    {n.link && (
                      <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                        <a href={n.link}><Bell className="w-3.5 h-3.5" /></a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(n.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
