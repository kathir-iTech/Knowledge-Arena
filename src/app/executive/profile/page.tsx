'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AvatarEditor } from '@/components/AvatarEditor';
import { useToast } from '@/hooks/use-toast';
import {
  Save, User, Calendar, Clock, Activity, Lock, Shield, Bell, MessageSquare,
} from 'lucide-react';

interface ProfileData {
  profile: {
    uid: string;
    name: string;
    email: string;
    avatar: string;
    role: string;
    lastLogin: string | null;
    createdAt: string | null;
    lastActivity: number | null;
    actionCount: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    target: string;
    timestamp: number;
  }>;
}

export default function ExecutiveProfilePage() {
  const { user, updateProfile } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);

  const fetchProfile = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/executive/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setName(data.profile.name || '');
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
    const fetchCounts = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const [notifRes, convRes] = await Promise.all([
          fetch('/api/executive/notifications?unreadOnly=true', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/messaging/conversations', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (notifRes.ok) {
          const n = await notifRes.json();
          setNotifCount(n.unreadCount || 0);
        }
        if (convRes.ok) {
          const c = await convRes.json();
          const total = (c.conversations || []).reduce((sum: number, conv: any) => sum + (conv.unreadCount?.[user.id] || 0), 0);
          setMsgCount(total);
        }
      } catch {}
    };
    fetchCounts();
  }, [user, auth, fetchProfile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const body: Record<string, unknown> = { name: name.trim() };
      if (password) body.password = password;
      const res = await fetch('/api/executive/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast({ variant: 'destructive', title: 'Error', description: err.error });
        return;
      }
      if (name.trim() && name.trim() !== profile?.profile.name) {
        await updateProfile({ name: name.trim() });
      }
      setPassword('');
      setShowPassword(false);
      toast({ variant: 'success', title: 'Profile Updated' });
      fetchProfile();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
    } finally {
      setSaving(false);
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

  const p = profile?.profile;

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="space-y-1.5">
        <h1 className="text-page-title font-headline tracking-tight">Profile</h1>
        <p className="text-base text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setAvatarEditorOpen(true)} className="group relative">
                  <Avatar className="w-16 h-16 ring-2 ring-border">
                    {(p?.avatar || user?.avatar || '').startsWith('http') ? (
                      <AvatarImage src={p?.avatar || user?.avatar} alt={p?.name || user?.name} />
                    ) : null}
                    <AvatarFallback className="text-xl bg-muted">
                      {(p?.avatar || user?.avatar || '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-[10px] font-medium">Change</span>
                  </div>
                </button>
                <div>
                  <p className="font-semibold text-lg">{p?.name || user?.name}</p>
                  <p className="text-sm text-muted-foreground">{p?.email || user?.email}</p>
                  <Badge variant="outline" className="mt-1 capitalize">{p?.role || user?.role}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 rounded-[10px] bg-muted/30">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Account Created</p>
                    <p className="text-sm font-medium">{p?.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-[10px] bg-muted/30">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Last Login</p>
                    <p className="text-sm font-medium">{p?.lastLogin ? new Date(p.lastLogin).toLocaleDateString() : 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-[10px] bg-muted/30">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Actions Performed</p>
                    <p className="text-sm font-medium">{p?.actionCount || 0}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-[10px] bg-muted/30">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">User ID</p>
                    <p className="text-sm font-medium font-mono text-xs">{p?.uid?.slice(0, 16)}...</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Display Name
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="displayName">Display Name</Label>
              <Input id="displayName" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="password">New Password</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="flex-1"
                />
                <Button variant="outline" onClick={() => setShowPassword(!showPassword)} className="shrink-0">
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 6 characters. Leave blank to keep your current password.</p>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around py-3 mb-3 border-b border-border/30">
                <div className="text-center">
                  <Bell className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold">{notifCount}</p>
                  <p className="text-[10px] text-muted-foreground">Unread Notifications</p>
                </div>
                <div className="text-center">
                  <MessageSquare className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold">{msgCount}</p>
                  <p className="text-[10px] text-muted-foreground">Unread Messages</p>
                </div>
                <div className="text-center">
                  <Activity className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold">{p?.actionCount || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Actions</p>
                </div>
              </div>
              {profile?.recentActivity && profile.recentActivity.length > 0 ? (
                <div className="space-y-0">
                  {profile.recentActivity.slice(0, 8).map(a => (
                    <div key={a.id} className="py-2 border-b border-border/30 last:border-0">
                      <p className="text-sm font-medium capitalize">{a.action.replace(/_/g, ' ')}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(a.timestamp).toLocaleDateString()}
                        {a.target && <span className="truncate">· {a.target}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {user && (
        <AvatarEditor isOpen={avatarEditorOpen} setIsOpen={setAvatarEditorOpen} currentAvatar={user.avatar} />
      )}
    </div>
  );
}
