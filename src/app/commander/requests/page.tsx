'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Inbox, Plus, MessageSquare, Paperclip, X, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  createdAt: number;
  handledAt: number | null;
  executiveComment: string | null;
  attachments: Attachment[];
  replyAttachments: Attachment[];
}

const MAX_FILE_SIZE = 500 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];

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

export default function CommanderRequestsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('question_bank');
  const [formDescription, setFormDescription] = useState('');
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/commander/requests', {
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
  }, [user, toast]);

  useEffect(() => {
    if (user) fetchRequests();
  }, [user, fetchRequests]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
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
    setFormAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const handleCreate = async () => {
    if (!formTitle || !formType) {
      toast({ variant: 'destructive', title: 'Error', description: 'Title and type are required.' });
      return;
    }
    setCreating(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/commander/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: formTitle, type: formType, description: formDescription, attachments: formAttachments }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast({ title: 'Request Submitted', description: 'Your request has been sent to the executive.' });
      setShowCreateDialog(false);
      setFormTitle('');
      setFormType('question_bank');
      setFormDescription('');
      setFormAttachments([]);
      fetchRequests();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit request.' });
    } finally {
      setCreating(false);
    }
  };

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
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">My Requests</h1>
          <p className="text-base text-muted-foreground">Submit and track requests to the executive.</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Request
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground mb-4">You haven't submitted any requests yet.</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />Submit Your First Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <Card key={r.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setSelectedRequest(r)}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-sm text-muted-foreground">{typeLabels[r.type] || r.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(r.createdAt)}</span>
                  <Badge variant={STATUS_VARIANT[r.status] || 'secondary'}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
            <DialogDescription>
              Submit a request to the executive for review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reqType">Request Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question_bank">Question Bank</SelectItem>
                  <SelectItem value="student_report">Student Report</SelectItem>
                  <SelectItem value="arena_approval">Arena Approval</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reqTitle">Title *</Label>
              <Input
                id="reqTitle"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Brief title for your request"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reqDesc">Description</Label>
              <Textarea
                id="reqDesc"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Provide details about your request..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Attachments</Label>
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-accent/30 text-sm text-muted-foreground">
                <Paperclip className="w-4 h-4" />
                <span>Attach files (max 500KB each)</span>
                <input type="file" multiple onChange={handleFileSelect} className="hidden" accept=".pdf,.csv,.json,.xlsx,.txt" />
              </label>
              {formAttachments.length > 0 && (
                <div className="space-y-1 mt-1">
                  {formAttachments.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                      </div>
                      <button onClick={() => setFormAttachments(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{selectedRequest.title}</h3>
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
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{formatDate(selectedRequest.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{selectedRequest.status}</p>
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
              {selectedRequest.executiveComment && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Executive Response</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg border-l-2 border-primary">{selectedRequest.executiveComment}</p>
                </div>
              )}
              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Attachments</p>
                  <div className="space-y-1">
                    {selectedRequest.attachments.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                        </div>
                        <button onClick={() => downloadFile(f)} className="text-muted-foreground hover:text-primary">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedRequest.replyAttachments && selectedRequest.replyAttachments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Executive Attachments</p>
                  <div className="space-y-1">
                    {selectedRequest.replyAttachments.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded-lg text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
                        </div>
                        <button onClick={() => downloadFile(f)} className="text-muted-foreground hover:text-primary">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
