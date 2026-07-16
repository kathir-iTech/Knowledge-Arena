'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

export default function GladiatorProfile() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '🎮');
  const [isSaving, setIsSaving] = useState(false);

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

      <Card>
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 ring-4 ring-primary/10 ring-offset-2 ring-offset-card">
              {avatar.startsWith('http') ? <AvatarImage src={avatar} alt={user?.name || 'Avatar'} className="object-cover" /> : null}
              <AvatarFallback className="text-5xl bg-secondary">
              {avatar.startsWith('http')
                ? ((user?.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')
                : avatar}
              </AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-xl font-headline">{user?.name || 'Anonymous'}</CardTitle>
          <CardDescription className="text-sm">{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={30}
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={cn(`text-xl w-11 h-11 touch-target flex items-center justify-center rounded-[12px] border-2 transition-all duration-150`,
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

          <Button
            onClick={handleSave}
            disabled={isSaving || !displayName.trim()}
            className="w-full h-12 text-base"
          >
            {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
