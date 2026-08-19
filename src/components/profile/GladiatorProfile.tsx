'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, ArrowLeft, Swords, Trophy, Star, Zap, TrendingUp, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

interface ProfileStats {
  totalBattles: number;
  wins: number;
  averageScore: number;
  accuracy: number;
}

export default function GladiatorProfile() {
  const { user, updateProfile } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '🎮');
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchStats = async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const res = await fetch('/api/gladiator/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch {}
      finally { setStatsLoading(false); }
    };
    fetchStats();
  }, [auth]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Display name cannot be empty.' });
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ name: displayName.trim(), avatar });
      toast({ title: 'Profile Updated', description: 'Your profile has been updated.' });
      router.push('/gladiator/dashboard');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container max-w-lg mx-auto space-y-6 safe-bottom safe-top animate-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/gladiator/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-page-title font-headline tracking-tight">Profile</h1>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 ring-4 ring-primary/10 ring-offset-2 ring-offset-card">
              {avatar.startsWith('http') ? <AvatarImage src={avatar} alt={user?.name || 'Avatar'} className="object-cover" /> : null}
              <AvatarFallback className="text-5xl bg-secondary">
                {avatar.startsWith('http') ? ((user?.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?') : avatar}
              </AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-xl font-headline">{user?.name || 'Anonymous'}</CardTitle>
          <CardDescription className="text-sm">{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Display Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" maxLength={30} className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(emoji => (
                <button key={emoji} type="button" onClick={() => setAvatar(emoji)}
                  className={cn('text-xl w-11 h-11 touch-target flex items-center justify-center rounded-[12px] border-2 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    avatar === emoji ? 'border-primary bg-primary/10 scale-110' : 'border-border/50 hover:border-primary/30 hover:bg-primary/5'
                  )}
                  aria-label={`Select avatar ${emoji}`}
                  aria-pressed={avatar === emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={isSaving || !displayName.trim()} className="w-full h-12 text-base">
            {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Battle Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-[10px]" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3">
              <ProfileStat icon={Swords} label="Battles" value={stats.totalBattles} />
              <ProfileStat icon={Trophy} label="Wins" value={stats.wins} />
              <ProfileStat icon={Star} label="Avg Score" value={stats.averageScore} />
              <ProfileStat icon={Zap} label="Accuracy" value={`${stats.accuracy}%`} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Complete a battle to see your stats.</p>
          )}
        </CardContent>
      </Card>

      {/* View History */}
      <Button variant="outline" className="w-full h-12" onClick={() => router.push('/gladiator/history')}>
        <History className="w-4 h-4 mr-2" /> View Battle History
      </Button>
    </div>
  );
}

function ProfileStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-[10px] bg-muted/30">
      <div className="w-9 h-9 rounded-[8px] bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-bold leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
