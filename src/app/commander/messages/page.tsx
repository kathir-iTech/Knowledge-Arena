'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Send, ArrowLeft, Loader2, Megaphone, CheckCheck, RefreshCw, WifiOff, Paperclip, X, Download,
  FileText, ChevronDown, Trash2, LogOut
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Conversation {
  id: string;
  participants: string[];
  participantRoles: Record<string, string>;
  participantNames: Record<string, string>;
  unreadCount: Record<string, number>;
  lastMessage?: { text: string; senderId: string; senderRole: string; timestamp: number };
  lastActivity: number;
  createdAt: number;
}

interface Attachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderRole: string;
  timestamp: number;
  attachments?: Attachment[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function downloadFile(attachment: Attachment) {
  const link = document.createElement('a');
  link.href = attachment.data.startsWith('data:') ? attachment.data : `data:${attachment.type};base64,${attachment.data}`;
  link.download = attachment.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('conversations');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showingMobileList, setShowingMobileList] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [convError, setConvError] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticMsgRef = useRef<string | null>(null);

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

  const getOtherParticipantName = useCallback((conv: Conversation | undefined) => {
    if (!conv || !user) return 'Executive';
    const otherId = conv.participants?.find(p => p !== user.id);
    if (!otherId) return 'Executive';
    return conv.participantNames?.[otherId] || 'Executive';
  }, [user]);

  const fetchConversations = useCallback(async () => {
    try {
      setConvError(false);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      setConvError(true);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setAnnouncementsError(false);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/messaging/announcements', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch {
      setAnnouncementsError(true);
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
    if (!user) return;
    const interval = setInterval(() => {
      fetchConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, fetchConversations]);

  useEffect(() => {
    if (!firestore || !activeConvId) return;
    const messagesRef = collection(firestore, 'conversations', activeConvId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      setLoadingMessages(false);
    }, () => {
      setLoadingMessages(false);
    });

    const convDocRef = doc(firestore, 'conversations', activeConvId);
    const unsubTyping = onSnapshot(convDocRef, (snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      if (!data) return;
      const typingMap = data.typing as Record<string, number> | undefined;
      if (!typingMap || !user) {
        setOtherTyping(false);
        return;
      }
      const otherId = Object.keys(typingMap).find(id => id !== user.id);
      if (otherId && typingMap[otherId]) {
        const elapsed = Date.now() - typingMap[otherId];
        setOtherTyping(elapsed < 3000);
      } else {
        setOtherTyping(false);
      }
    });

    return () => { unsubMessages(); unsubTyping(); setOtherTyping(false); };
  }, [firestore, activeConvId, user]);

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

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollButton(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeConvId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setLoadingMessages(true);
    setOtherTyping(false);
    setShowScrollButton(false);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 500 * 1024) {
        toast({ variant: 'destructive', title: 'File too large', description: `${file.name} exceeds 500KB limit.` });
        continue;
      }
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newFiles.push({ name: file.name, type: file.type, size: file.size, data });
    }
    setFileAttachments(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const sendMessage = async () => {
    if ((!messageText.trim() && fileAttachments.length === 0) || !activeConvId || sending) return;
    const idempotencyKey = uuidv4();
    const optimisticId = 'opt_' + Date.now();
    const textToSend = messageText.trim();
    const filesToSend = [...fileAttachments];
    setSending(true);
    const optimisticMessage: Message = {
      id: optimisticId,
      text: textToSend,
      senderId: user?.id || '',
      senderRole: 'commander',
      timestamp: Date.now(),
      attachments: filesToSend.length > 0 ? filesToSend : undefined,
    };
    setMessages(prev => [...prev, optimisticMessage]);
    optimisticMsgRef.current = optimisticId;
    setMessageText('');
    setFileAttachments([]);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`/api/messaging/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: textToSend, attachments: filesToSend, idempotencyKey }),
      });
      if (!res.ok) throw new Error('Failed to send');
      optimisticMsgRef.current = null;
      fetchConversations();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
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

  const writeTypingIndicator = useCallback(async () => {
    if (!firestore || !activeConvId || !user) return;
    const convRef = doc(firestore, 'conversations', activeConvId);
    try {
      await updateDoc(convRef, { [`typing.${user.id}`]: Date.now() });
    } catch {}
  }, [firestore, activeConvId, user]);

  const handleTyping = useCallback(() => {
    if (typingWriteTimeoutRef.current) {
      clearTimeout(typingWriteTimeoutRef.current);
    }
    typingWriteTimeoutRef.current = setTimeout(() => {
      writeTypingIndicator();
    }, 300);
  }, [writeTypingIndicator]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/messaging/conversations/${activeConvId}/messages/${msgId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete', description: 'Could not delete message.' });
    }
  };

  const leaveConversation = async () => {
    if (!activeConvId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`/api/messaging/conversations/${activeConvId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to leave');
      setLeaveDialogOpen(false);
      setActiveConvId(null);
      setShowingMobileList(true);
      fetchConversations();
      toast({ title: 'Left conversation', description: 'You have left the conversation.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to leave conversation.' });
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

  const activeConv = useMemo(() => conversations.find(c => c.id === activeConvId), [conversations, activeConvId]);

  const totalUnread = useMemo(() => conversations.reduce((sum, c) =>
    sum + (c.unreadCount?.[user?.id || ''] || 0), 0), [conversations, user?.id]);

  const unreadAnnouncements = useMemo(() => announcements.filter(a =>
    !a.readBy?.includes(user?.id || '')
  ).length, [announcements, user?.id]);

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
                [1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)
              ) : convError ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <WifiOff className="w-8 h-8 text-destructive mb-2" />
                  <p className="text-sm text-destructive font-medium">Failed to load conversations</p>
                  <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
                  <Button variant="outline" size="sm" onClick={fetchConversations} className="mt-3">
                    <RefreshCw className="w-3 h-3 mr-1" /> Retry
                  </Button>
                </div>
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
                        "w-full text-left p-3 rounded-[10px] border transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        activeConvId === conv.id
                          ? "border-primary bg-primary/5 shadow-elevation-small"
                          : "border-border/40 hover:border-primary/30 hover:bg-muted/20 hover:shadow-elevation-small"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">
                          {getOtherParticipantName(conv)}
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
                  <span className="font-medium text-sm flex-1">{getOtherParticipantName(activeConv)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setLeaveDialogOpen(true)}
                    aria-label="Leave conversation"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 relative">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-2/3 ml-auto" />
                      <Skeleton className="h-12 w-1/2" />
                      <Skeleton className="h-14 w-2/3" />
                    </div>
                  ) : messages.length === 0 && !otherTyping ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMine = msg.senderId === user?.id;
                      const isOptimistic = msg.id.startsWith('opt_');
                      const senderName = isMine ? 'You' : getOtherParticipantName(activeConv);
                      const senderInitial = senderName?.charAt(0)?.toUpperCase() || '?';
                      return (
                        <div key={msg.id} className={cn("flex gap-1.5 group", isMine ? "justify-end" : "justify-start")}>
                          {!isMine && (
                            <div className="flex flex-col justify-end shrink-0">
                              <Avatar className="w-7 h-7">
                                <AvatarFallback className="text-[10px] bg-muted-foreground/20 text-muted-foreground">
                                  {senderInitial}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[85%] sm:max-w-[75%] px-3 py-2 text-sm break-words whitespace-pre-wrap relative shadow-sm",
                            isMine
                              ? "bg-primary text-primary-foreground rounded-[18px] rounded-br-[4px]"
                              : "bg-card text-card-foreground border border-border/30 rounded-[18px] rounded-bl-[4px]",
                            isOptimistic && "opacity-70"
                          )}>
                            {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className={cn("space-y-1", msg.text ? "mt-2" : "")}>
                                {msg.attachments.map((f, i) => {
                                  const isImage = f.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name);
                                  const isPdf = /\.pdf$/i.test(f.name);
                                  return isImage ? (
                                    <button key={i} onClick={() => setPreviewImageUrl(f.data)} className="block max-w-[200px] rounded-lg overflow-hidden border border-border/30 hover:opacity-90 transition-opacity duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                                      <img src={f.data} alt={f.name} className="w-full h-auto object-cover max-h-[200px]" />
                                      <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground bg-background/80">
                                        <Download className="w-3 h-3" />
                                        <span className="truncate">{f.name}</span>
                                        <span>({formatFileSize(f.size)})</span>
                                      </div>
                                    </button>
                                  ) : (
                                    <div key={i} className={cn(
                                      "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs",
                                      isMine ? "bg-primary-foreground/10" : "bg-muted/50"
                                    )}>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {isPdf ? (
                                          <FileText className="w-3 h-3 shrink-0 opacity-70" />
                                        ) : (
                                          <Paperclip className="w-3 h-3 shrink-0 opacity-70" />
                                        )}
                                        <span className="truncate">{f.name}</span>
                                        <span className="opacity-60 shrink-0">({formatFileSize(f.size)})</span>
                                      </div>
                                      <button onClick={() => downloadFile(f)} aria-label={`Download ${f.name}`} className="opacity-70 hover:opacity-100 shrink-0 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className={cn(
                              "flex items-center gap-1 mt-1",
                              isMine ? "justify-end" : "justify-start"
                            )}>
                              <span className="text-[10px] opacity-70">{formatTime(msg.timestamp)}</span>
                              {isMine && <CheckCheck className="w-3 h-3 opacity-70" />}
                              {isOptimistic && <Loader2 className="w-3 h-3 animate-spin opacity-70" />}
                              {isMine && msg.id !== optimisticMsgRef.current && (
                                <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity duration-300 ease-out ml-1 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:opacity-100" aria-label="Delete message">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {otherTyping && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>{getOtherParticipantName(activeConv)} is typing...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                  {showScrollButton && (
                    <button
                      onClick={scrollToBottom}
                      className="sticky bottom-2 z-10 bg-primary text-primary-foreground rounded-full p-2 shadow-lg hover:bg-primary/90 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background mx-auto"
                      aria-label="Scroll to bottom"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="p-3 border-t border-border/20 bg-background rounded-b-lg">
                  {fileAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {fileAttachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-lg text-xs">
                          <Paperclip className="w-3 h-3 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-[120px]">{f.name}</span>
                          <span className="text-muted-foreground">({formatFileSize(f.size)})</span>
                          <button onClick={() => setFileAttachments(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-destructive ml-0.5 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <label className="cursor-pointer text-muted-foreground hover:text-foreground mb-0.5 shrink-0 rounded-md p-0.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                      <Paperclip className="w-5 h-5" />
                      <input type="file" multiple onChange={handleFileSelect} className="hidden" accept=".pdf,.csv,.json,.xlsx,.txt,.png,.jpg,.jpeg,.gif" />
                    </label>
                    <textarea
                      value={messageText}
                      onChange={e => { setMessageText(e.target.value); handleTyping(); }}
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
                      disabled={(!messageText.trim() && fileAttachments.length === 0) || sending || offline}
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
                  <div className="w-14 h-14 rounded-[14px] bg-muted flex items-center justify-center mx-auto mb-3 ring-1 ring-border/20">
                    <MessageSquare className="w-7 h-7 text-muted-foreground" />
                  </div>
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
              [1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)
            ) : announcementsError ? (
              <div className="flex flex-col items-center py-16 text-center">
                <WifiOff className="w-10 h-10 text-destructive mx-auto mb-3" />
                <p className="text-base text-destructive font-medium">Failed to load announcements</p>
                <Button variant="outline" size="sm" onClick={fetchAnnouncements} className="mt-3">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-base text-muted-foreground">No announcements yet.</p>
              </div>
            ) : (
              announcements.map(a => {
                const isUnread = !a.readBy?.includes(user?.id || '');
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => markAnnouncementRead(a.id)}
                    className={cn(
                      "w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-[14px]",
                      isUnread && "cursor-pointer", !isUnread && "cursor-default"
                    )}
                  >
                    <Card className={cn(isUnread && "border-primary/40")}>
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
                  </button>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Conversation</DialogTitle>
            <DialogDescription>Are you sure you want to leave this conversation? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={leaveConversation}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImageUrl} onOpenChange={() => setPreviewImageUrl(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {previewImageUrl && (
              <img src={previewImageUrl} alt="Preview" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
