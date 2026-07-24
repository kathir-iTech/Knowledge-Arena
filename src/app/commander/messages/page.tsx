'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Send, ArrowLeft, Loader2, Megaphone, CheckCheck, RefreshCw, WifiOff
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Conversation {
  id: string;
  participants: string[];
  participantRoles: Record<string, string>;
  unreadCount: Record<string, number>;
  lastMessage?: { text: string; senderId: string; senderRole: string; timestamp: number };
  lastActivity: number;
  createdAt: number;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderRole: string;
  timestamp: number;
}

interface Announcement {
  id: string;
  senderId: string;
  text: string;
  targetRole: string;
  targetId?: string;
  readBy: string[];
  createdAt: number;
}

export default function CommanderMessagesPage() {
  const { user } = useAuth();
  const { auth, firestore } = useFirebase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('conversations');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showingMobileList, setShowingMobileList] = useState(true);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/announcements', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch {
      // Silently handle
    } finally {
      setLoadingAnnouncements(false);
    }
  }, [auth]);

  useEffect(() => {
    if (user) {
      fetchConversations();
      fetchAnnouncements();
    }
  }, [user, fetchConversations, fetchAnnouncements]);

  useEffect(() => {
    if (!firestore || !activeConvId) return;
    const messagesRef = collection(firestore, 'conversations', activeConvId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      setLoadingMessages(false);
    }, () => { setLoadingMessages(false); });
    return () => unsubscribe();
  }, [firestore, activeConvId]);

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isNearBottom]);

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setLoadingMessages(true);
    setShowingMobileList(false);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`/api/messaging/conversations/${convId}/read`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, unreadCount: { ...c.unreadCount, [auth.currentUser?.uid || '']: 0 } } : c
      ));
    } catch {}
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !activeConvId || sending) return;
    setSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`/api/messaging/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: messageText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send');
      setMessageText('');
      fetchConversations();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to send',
        description: 'Your message could not be sent. Check your connection and try again.',
        action: (
          <Button variant="outline" size="sm" onClick={() => sendMessage()}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const markAnnouncementRead = async (annId: string) => {
    if (announcements.find(a => a.id === annId)?.readBy?.includes(user?.id || '')) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`/api/messaging/announcements/${annId}/read`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      fetchAnnouncements();
    } catch {}
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  const totalUnread = conversations.reduce((sum, c) =>
    sum + (c.unreadCount?.[user?.id || ''] || 0), 0);

  const unreadAnnouncements = announcements.filter(a =>
    !a.readBy?.includes(user?.id || '')
  ).length;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="page-container animate-in h-[calc(100vh-4rem)] flex flex-col">
      {offline && (
        <div className="flex items-center gap-2 px-4 py-2 mb-3 text-sm bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>You are offline. Messages will not send until reconnected.</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-page-title font-headline tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">Communicate with your Executive and view announcements.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowingMobileList(true); }} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="conversations" className="relative">
            <MessageSquare className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Messages</span>
            <span className="sm:hidden">Chat</span>
            {totalUnread > 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground text-[10px] h-5 px-1.5">
                {totalUnread}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="announcements" className="relative">
            <Megaphone className="w-4 h-4 mr-2" />
            Announcements
            {unreadAnnouncements > 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground text-[10px] h-5 px-1.5">
                {unreadAnnouncements}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="flex-1 flex gap-4 min-h-0">
          <div className={cn(
            "w-64 shrink-0 flex flex-col gap-3",
            "md:flex",
            !showingMobileList && "hidden md:flex"
          )}>
            <div className="flex-1 overflow-y-auto space-y-1">
              {loading ? (
                [1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">An Executive will reach out to you.</p>
                </div>
              ) : (
                conversations.map(conv => {
                  const unread = conv.unreadCount?.[user?.id || ''] || 0;
                  const lastMsg = conv.lastMessage;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        activeConvId === conv.id
                          ? "border-primary bg-primary/5"
                          : "border-border/40 hover:border-primary/30 hover:bg-muted/20"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">
                          Executive
                        </span>
                        {lastMsg && (
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatTime(lastMsg.timestamp)}
                          </span>
                        )}
                      </div>
                      {lastMsg && (
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg.senderId === user?.id ? 'You: ' : ''}{lastMsg.text}
                        </p>
                      )}
                      {unread > 0 && (
                        <Badge className="mt-1 bg-primary text-primary-foreground text-[10px] h-4 px-1">
                          {unread} new
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className={cn(
            "flex-1 flex flex-col min-w-0 border rounded-lg border-border/30",
            showingMobileList && "hidden md:flex"
          )}>
            {activeConvId && activeConv ? (
              <>
                <div className="flex items-center gap-2 p-3 border-b border-border/20 bg-secondary/10 rounded-t-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8"
                    onClick={() => setShowingMobileList(true)}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-medium text-sm">Executive</span>
                </div>
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMine = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl text-sm break-words whitespace-pre-wrap",
                            isMine
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-secondary text-secondary-foreground rounded-bl-md"
                          )}>
                            <p>{msg.text}</p>
                            <div className={cn(
                              "flex items-center gap-1 mt-1",
                              isMine ? "justify-end" : "justify-start"
                            )}>
                              <span className="text-[10px] opacity-70">{formatTime(msg.timestamp)}</span>
                              {isMine && <CheckCheck className="w-3 h-3 opacity-70" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-3 border-t border-border/20 bg-background rounded-b-lg">
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      placeholder="Type a message... (Shift+Enter for new line)"
                      onKeyDown={handleKeyDown}
                      rows={1}
                      className="flex-1 min-h-[40px] max-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      style={{ height: 'auto', overflow: 'hidden' }}
                      onInput={e => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={sendMessage}
                      disabled={!messageText.trim() || sending || offline}
                      className="shrink-0 mb-0.5"
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-base text-muted-foreground font-medium">Select a conversation</p>
                  <p className="text-sm text-muted-foreground mt-1">Choose a conversation from the left.</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-3 h-full">
            {loadingAnnouncements ? (
              [1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-base text-muted-foreground">No announcements yet.</p>
              </div>
            ) : (
              announcements.map(a => {
                const isUnread = !a.readBy?.includes(user?.id || '');
                return (
                  <Card
                    key={a.id}
                    className={cn(isUnread && "border-primary/40 cursor-pointer", !isUnread && "cursor-default")}
                    onClick={() => markAnnouncementRead(a.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Megaphone className={cn(
                          "w-5 h-5 shrink-0 mt-0.5",
                          isUnread ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm whitespace-pre-wrap break-words", isUnread && "font-medium")}>{a.text}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{formatTime(a.createdAt)}</span>
                            {isUnread && (
                              <>
                                <span>&middot;</span>
                                <span className="text-primary font-medium">New</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
