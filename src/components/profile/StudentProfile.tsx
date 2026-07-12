'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

export default function StudentProfile() {
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
      toast({ title: 'Profile Updated', description: 'Your gladiator profile has been updated.' });
      router.push('/student/dashboard');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto space-y-6 safe-bottom animate-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => router.push('/student/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-headline text-primary tracking-tight">Gladiator Profile</h1>
      </div>

      <Card className="border-primary/20 shadow-glow-primary">
        <CardHeader className="text-center pb-3">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 border-4 border-primary/20 ring-2 ring-primary/10">
              <AvatarFallback className="text-5xl bg-background">{avatar}</AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-xl font-headline">{user?.name || 'Anonymous Gladiator'}</CardTitle>
          <CardDescription className="text-xs">{user?.email}</CardDescription>
          <div className="mt-2"><Badge variant="outline" className="text-[10px] h-5">{user?.role?.toUpperCase()}</Badge></div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your gladiator name"
              maxLength={30}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Avatar</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`text-lg w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-150 ${
                    avatar === emoji ? 'border-primary bg-primary/10 scale-110 shadow-sm' : 'border-border/50 hover:border-primary/40 hover:bg-primary/5'
                  }`}
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
            className="w-full h-11 text-sm font-semibold"
          >
            {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
