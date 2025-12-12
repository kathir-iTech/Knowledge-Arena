"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

interface AvatarEditorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  currentAvatar: string;
}

export const AvatarEditor: React.FC<AvatarEditorProps> = ({ isOpen, setIsOpen, currentAvatar }) => {
  const { updateAvatar } = useAuth();

  const handleSelectAvatar = async (emoji: string) => {
    await updateAvatar(emoji);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-headline text-primary">Choose Your Avatar</DialogTitle>
          <DialogDescription>Select an emoji to represent you in the arena.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-4 py-4">
          {EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              className={`text-4xl h-16 w-16 transition-transform duration-200 hover:scale-125 ${currentAvatar === emoji ? 'border-2 border-primary' : ''}`}
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
