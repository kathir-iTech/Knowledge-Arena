'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Inbox, Check, X, MessageSquare, Search, Paperclip, Download, Archive, MoreHorizontal, FileText, Image as ImageIcon, FileType, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Attachment {
  name: string;
  type: string;
  size: number;
  data: string;
}

interface RequestItem {
  id: string;
  title: string;
  type: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  commanderId: string;
  commanderEmail: string;
  createdAt: number;
  handledAt: number | null;
  handledBy: string | null;
  executiveComment: string | null;
  attachments: Attachment[];
  replyAttachments: Attachment[];
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  completed: 'default',
};

const typeLabels: Record<string, string> = {
  question_bank: 'Question Bank',
  student_report: 'Student Report',
  arena_approval: 'Arena Approval',
  other: 'Other',
};

export default function ExecutiveRequestsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [comment, setComment] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = statusFilter !== 'all' && statusFilter !== '' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/executive/requests${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load requests.' });
    } finally {
      setLoading(false);
    }
  }, [user, toast, statusFilter]);

  useEffect(() => {
    if (user) fetchRequests();
  }, [user, fetchRequests]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setProcessing(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/executive/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status: newStatus, comment, replyAttachments }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast({ title: 'Request Updated', description: `Request marked as ${newStatus}.` });
      setSelectedRequest(null);
      setComment('');
      setReplyAttachments([]);
      fetchRequests();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update request.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('Delete this request? This action cannot be undone.')) return;
    setProcessing(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/executive/requests?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Request Deleted', description: 'The request has been permanently removed.' });
      setSelectedRequest(null);
      setComment('');
      setReplyAttachments([]);
      fetchRequests();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete request.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
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
      newAttachments.push({ name: file.name, type: file.type, size: file.size, data });
    }
    setReplyAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const filtered = requests.filter(r => {
    if (search) {
      const lower = search.toLowerCase();
      return r.title.toLowerCase().includes(lower) || r.commanderEmail.toLowerCase().includes(lower);
    }
    return true;
  });

  const formatDate = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-6">
        <h1 className="text-page-title font-headline tracking-tight">Requests</h1>
        <p className="text-base text-muted-foreground">Review and manage platform requests from commanders.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'pending', 'approved', 'rejected', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-300 ease-out',
                statusFilter === status
                  ? 'bg-primary text-primary-foreground shadow-elevation-small'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">
              {search ? 'No requests match your search.' : 'No requests have been submitted yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setSelectedRequest(r)}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {typeLabels[r.type] || r.type} &middot; {r.commanderEmail}
                      {r.attachments && r.attachments.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                          <Paperclip className="w-3 h-3" />
                          {r.attachments.length}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(r.createdAt)}</span>
                  <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </Badge>
                  {r.status !== 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRequest(r.id); }}
                      className="ml-2 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete request"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setComment(''); setReplyAttachments([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-headline font-semibold">{selectedRequest.title}</h3>
                <Badge variant={STATUS_VARIANT[selectedRequest.status] || 'secondary'}>
                  {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{typeLabels[selectedRequest.type] || selectedRequest.type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">From</p>
                  <p className="font-medium">{selectedRequest.commanderEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{formatDate(selectedRequest.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Handled</p>
                  <p className="font-medium">{selectedRequest.handledAt ? formatDate(selectedRequest.handledAt) : 'Not yet'}</p>
                </div>
              </div>
              {selectedRequest.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedRequest.description}</p>
                </div>
              )}
              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Attachments</p>
                  <div className="space-y-1">
                    {selectedRequest.attachments.map((f, i) => {
                      const isImage = f.type.startsWith('image/') || f.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
                      const isPdf = f.type === 'application/pdf' || f.name.endsWith('.pdf');
                      const isDocx = f.name.endsWith('.docx');
                      const FileIcon = isImage ? ImageIcon : isPdf ? FileText : isDocx ? FileType : Paperclip;
                      return (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isImage && (
                              <button
                                onClick={() => {
                                  setPreviewImage(f.data.startsWith('data:') ? f.data : `data:${f.type};base64,${f.data}`);
                                }}
                                className="p-1 text-muted-foreground hover:text-primary"
                                title="Preview"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => downloadFile(f)} className="p-1 text-muted-foreground hover:text-primary" title="Download">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedRequest.executiveComment && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Executive Note</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">{selectedRequest.executiveComment}</p>
                </div>
              )}

              {selectedRequest.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="comment">Executive Note (optional)</Label>
                    <Textarea
                      id="comment"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Add a note about your decision..."
                      className="min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reply Attachments</Label>
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-accent/30 text-sm text-muted-foreground">
                      <Paperclip className="w-4 h-4" />
                      <span>Attach files (max 500KB each)</span>
                      <input type="file" multiple onChange={handleReplyFileSelect} className="hidden" accept=".pdf,.csv,.json,.xlsx,.txt" />
                    </label>
                    {replyAttachments.length > 0 && (
                      <div className="space-y-1">
                        {replyAttachments.map((f, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                            </div>
                            <button onClick={() => setReplyAttachments(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="destructive" onClick={() => handleStatusUpdate(selectedRequest.id, 'rejected')} disabled={processing}>
                      <X className="w-4 h-4 mr-2" /> Reject
                    </Button>
                    <Button variant="outline" onClick={() => handleStatusUpdate(selectedRequest.id, 'completed')} disabled={processing}>
                      <Check className="w-4 h-4 mr-2" /> Mark Complete
                    </Button>
                    <Button onClick={() => handleStatusUpdate(selectedRequest.id, 'approved')} disabled={processing}>
                      <Check className="w-4 h-4 mr-2" /> Approve
                    </Button>
                  </div>
                </>
              )}
              {selectedRequest.status !== 'pending' && (
                <div className="flex justify-end pt-2 border-t border-border/30">
                  <Button variant="outline" size="sm" onClick={() => handleDeleteRequest(selectedRequest.id)} disabled={processing}>
                    <Archive className="w-4 h-4 mr-2" /> Delete Request
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="relative w-full h-[60vh] bg-muted/20 rounded-lg overflow-hidden">
              <Image
                src={previewImage}
                alt="Attachment preview"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
