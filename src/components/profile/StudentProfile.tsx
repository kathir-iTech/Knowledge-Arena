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
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-6 safe-bottom">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/student/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-headline text-primary">Gladiator Profile</h1>
      </div>

      <Card className="border-primary/20 bg-secondary/10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarFallback className="text-5xl bg-background">{avatar}</AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-xl">{user?.name || 'Anonymous Gladiator'}</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
          <Badge variant="outline" className="mt-2">{user?.role?.toUpperCase()}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your gladiator name"
              maxLength={30}
              className="h-12 text-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg border transition-all ${
                    avatar === emoji ? 'border-primary bg-primary/10 scale-110' : 'border-border hover:border-primary/50'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !displayName.trim()}
            className="w-full h-12 text-lg"
          >
            {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
