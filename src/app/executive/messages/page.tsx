'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Send, Search, Plus, ArrowLeft,
  Loader2, Megaphone, CheckCheck, RefreshCw, WifiOff
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
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

interface CommanderUser {
  id: string;
  name: string;
  email: string;
}

export default function ExecutiveMessagesPage() {
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
  const [sidebarSearch, setSidebarSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('conversations');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [offline, setOffline] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showingMobileList, setShowingMobileList] = useState(true);

  const [showCompose, setShowCompose] = useState(false);
  const [commanders, setCommanders] = useState<CommanderUser[]>([]);
  const [loadingCommanders, setLoadingCommanders] = useState(false);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [selectedCommander, setSelectedCommander] = useState<CommanderUser | null>(null);

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

  const openCompose = async () => {
    setShowCompose(true);
    setCommanderSearch('');
    setSelectedCommander(null);
    setLoadingCommanders(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/commanders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCommanders(data.commanders || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load commanders.' });
    } finally {
      setLoadingCommanders(false);
    }
  };

  const startConversation = async () => {
    if (!selectedCommander) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commanderId: selectedCommander.id }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      setShowCompose(false);
      fetchConversations();
      selectConversation(data.conversation.id);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to start conversation.' });
    }
  };

  const sendAnnouncement = async () => {
    if (!announcementText.trim() || sendingAnnouncement) return;
    setSendingAnnouncement(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No token');
      const res = await fetch('/api/messaging/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: announcementText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send');
      setAnnouncementText('');
      toast({ title: 'Announcement Sent', description: 'All commanders will see this.' });
      fetchAnnouncements();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to send announcement.' });
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const getOtherParticipantId = (conv: Conversation) =>
    conv.participants.find(p => p !== user?.id) || '';

  const activeConv = conversations.find(c => c.id === activeConvId);

  const totalUnread = conversations.reduce((sum, c) =>
    sum + (c.unreadCount?.[user?.id || ''] || 0), 0);

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
          <p className="text-sm text-muted-foreground">Communicate with commanders and send announcements.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowingMobileList(true); }} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="conversations" className="relative">
            <MessageSquare className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Conversations</span>
            <span className="sm:hidden">Chat</span>
            {totalUnread > 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground text-[10px] h-5 px-1.5">
                {totalUnread}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="announcements">
            <Megaphone className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Announcements</span>
            <span className="sm:hidden">Ann.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="flex-1 flex gap-4 min-h-0">
          <div className={cn(
            "w-72 shrink-0 flex flex-col gap-3",
            "md:flex",
            !showingMobileList && "hidden md:flex"
          )}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <Button size="sm" onClick={openCompose} className="shrink-0 h-9" aria-label="New conversation">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {loading ? (
                [1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet.</p>
                  <Button variant="link" size="sm" onClick={openCompose} className="mt-1">
                    Start a conversation
                  </Button>
                </div>
              ) : (
                conversations.map(conv => {
                  const unread = conv.unreadCount?.[user?.id || ''] || 0;
                  const lastMsg = conv.lastMessage;
                  const otherId = getOtherParticipantId(conv);
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
                          Commander {otherId.slice(0, 8)}
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
                  <span className="font-medium text-sm">
                    Commander {getOtherParticipantId(activeConv).slice(0, 8)}
                  </span>
                </div>
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <p className="text-sm text-muted-foreground">No messages yet. Send a message to start.</p>
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
                  <p className="text-sm text-muted-foreground mt-1">Choose a conversation from the left or start a new one.</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="flex-1 flex gap-4 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {loadingAnnouncements ? (
              [1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-base text-muted-foreground">No announcements sent yet.</p>
              </div>
            ) : (
              announcements.map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Megaphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{a.text}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{formatTime(a.createdAt)}</span>
                          <span>&middot;</span>
                          <span>To: {a.targetRole === 'all_commanders' ? 'All Commanders' : 'Specific Commander'}</span>
                          <span>&middot;</span>
                          <span>{a.readBy?.length || 0} read</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="w-80 shrink-0 hidden lg:block">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-headline font-bold text-sm">Send Announcement</h3>
                <p className="text-xs text-muted-foreground">Broadcast a message to all commanders.</p>
                <textarea
                  value={announcementText}
                  onChange={e => setAnnouncementText(e.target.value)}
                  placeholder="Type your announcement..."
                  className="w-full min-h-[100px] rounded-lg border border-input bg-background p-3 text-sm resize-none"
                />
                <Button
                  onClick={sendAnnouncement}
                  disabled={!announcementText.trim() || sendingAnnouncement}
                  className="w-full"
                >
                  {sendingAnnouncement ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
                  Send Announcement
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>Search and select a commander to message.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="Search commanders by name..."
              value={commanderSearch}
              onChange={e => setCommanderSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {loadingCommanders ? (
                [1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)
              ) : commanders.filter(c => !commanderSearch || c.name?.toLowerCase().includes(commanderSearch.toLowerCase())).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No commanders found.</p>
              ) : (
                commanders
                  .filter(c => !commanderSearch || c.name?.toLowerCase().includes(commanderSearch.toLowerCase()))
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCommander(c)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border text-sm transition-colors",
                        selectedCommander?.id === c.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      )}
                    >
                      <span className="font-medium">{c.name || 'Unknown'}</span>
                      {c.email && <span className="text-xs text-muted-foreground ml-2">{c.email}</span>}
                    </button>
                  ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button onClick={startConversation} disabled={!selectedCommander}>Start Conversation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
