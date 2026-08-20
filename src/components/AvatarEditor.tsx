
"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

const EMOJIS = [
  "🤖", "👾", "🔮", "🧠", "👻", "🧑", "🧛", "🧟", "🧞", "🦹", "🦸", "🧙",
  "🧚", "👨‍🎤", "🕵️", "💂", "👨‍🎨", "👨‍🔬", "👨‍🔧", "👨‍⚖️",
  "👨‍🚒", "🧑‍🍳"
];

interface AvatarEditorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  currentAvatar: string;
}

export const AvatarEditor: React.FC<AvatarEditorProps> = ({ isOpen, setIsOpen, currentAvatar }) => {
  const { user, updateAvatar } = useAuth();

  const handleSelectAvatar = async (emoji: string) => {
    if (user) {
      try {
        await updateAvatar(emoji);
      } catch {
        toast({ title: 'Failed to update avatar', description: 'Please try again.', variant: 'destructive' });
        return;
      }
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-headline text-primary">Choose Your Avatar</DialogTitle>
          {user && (
            <p className="text-sm text-muted-foreground">
              Logged in as: <span className="font-semibold text-primary">{user.name}</span>
            </p>
          )}
          <DialogDescription>Select an emoji to represent you in the arena.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 sm:gap-4 py-4 max-h-[50vh] overflow-y-auto">
          {EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              aria-label={`Select ${emoji} as your avatar`}
              aria-pressed={currentAvatar === emoji}
              className={`text-3xl sm:text-4xl h-14 w-14 sm:h-16 sm:w-16 transition-transform duration-300 hover:scale-125 ${currentAvatar === emoji ? 'border-2 border-primary' : ''}`}
              onClick={() => handleSelectAvatar(emoji)}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
