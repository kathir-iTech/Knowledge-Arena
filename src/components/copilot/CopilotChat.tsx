'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useFirebase } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, MessageCircle, Send, Bot, User, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function CopilotChat() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Commander, I am your Tactical Assistant. Ask me anything about your arena, quizzes, or battle strategies.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!user || user.role !== 'teacher') return null;

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isLoading) return;

    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!idToken) throw new Error('Session expired. Please log out and log back in.');

      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach the Tactical Assistant';
      setError(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}. Please try again.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-elevation-large z-50"
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3.5 border-b border-border/50 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-primary text-sm">
            <Bot className="h-4 w-4" />
            Tactical Assistant
          </SheetTitle>
        </SheetHeader>

        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2.5 max-w-[88%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "shrink-0 h-7 w-7 rounded-full flex items-center justify-center",
                  msg.role === 'user' ? "bg-primary/10" : "bg-accent/10"
                )}>
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-accent" />}
                </div>
                <div className={cn(
                  "rounded-[12px] px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-primary text-primary-foreground"
                    : msg.content.startsWith('Error:')
                      ? "bg-destructive/5 border border-destructive/10 text-destructive"
                      : "bg-secondary border border-border/50"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 max-w-[88%]">
                <div className="shrink-0 h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="rounded-lg px-3.5 py-2.5 bg-secondary/30 border border-border/20">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border/50 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the Tactical Assistant..."
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
