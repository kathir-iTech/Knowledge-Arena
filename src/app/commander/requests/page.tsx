'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Inbox, Plus, MessageSquare } from 'lucide-react';
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

interface RequestItem {
  id: string;
  title: string;
  type: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: number;
  handledAt: number | null;
  executiveComment: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border border-warning/20',
  approved: 'bg-success/10 text-success border border-success/20',
  rejected: 'bg-destructive/10 text-destructive border border-destructive/20',
  completed: 'bg-primary/10 text-primary border border-primary/20',
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
        body: JSON.stringify({ title: formTitle, type: formType, description: formDescription }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast({ title: 'Request Submitted', description: 'Your request has been sent to the executive.' });
      setShowCreateDialog(false);
      setFormTitle('');
      setFormType('question_bank');
      setFormDescription('');
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
                  <Badge className={cn(statusColors[r.status])}>
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
                <Badge className={cn(statusColors[selectedRequest.status])}>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
