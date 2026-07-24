'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Plus, Search, Check, Ban, Swords, Clock, Calendar, Key, Trash2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const COMMANDER_DOMAIN = 'knowledgearena.app';

interface Commander {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  deleted?: boolean;
  createdAt: number;
  arenaCount: number;
  lastActive: number | null;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

function validateUsername(input: string): string | null {
  if (!input.trim()) return 'Username is required.';
  if (input.includes('@')) return null;
  if (input.length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-zA-Z0-9_.-]+$/.test(input)) return 'Username can only contain letters, numbers, underscores, hyphens, and dots.';
  return null;
}

export default function CommanderManagementPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [commanders, setCommanders] = useState<Commander[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'deleted'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [toggleConfirmCommander, setToggleConfirmCommander] = useState<Commander | null>(null);
  const [processingToggle, setProcessingToggle] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<Commander | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [deleteConfirmCommander, setDeleteConfirmCommander] = useState<Commander | null>(null);
  const [processingDelete, setProcessingDelete] = useState(false);

  async function safeParseJson(res: Response) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '');
      throw new Error(text ? 'Server returned an invalid response.' : 'Server unavailable.');
    }
    return res.json();
  }

  const fetchCommanders = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/users?role=commander', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = await safeParseJson(res).catch(() => null);
        throw new Error(errBody?.error || 'Failed to load commanders.');
      }
      const data = await safeParseJson(res);
      setCommanders(data.users || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load commanders.' });
    } finally {
      setLoading(false);
    }
  }, [auth, toast]);

  useEffect(() => {
    if (user) fetchCommanders();
  }, [user, fetchCommanders]);

  const getOrGenerateEmail = (input: string): string => {
    if (input.includes('@')) return input;
    return `${input}@${COMMANDER_DOMAIN}`;
  };

  const handleCreate = async () => {
    const usernameError = validateUsername(usernameInput);
    if (usernameError) {
      toast({ variant: 'warning', title: 'Validation Error', description: usernameError });
      return;
    }
    if (!createPassword || createPassword.length < 6) {
      toast({ variant: 'warning', title: 'Validation Error', description: 'Password must be at least 6 characters.' });
      return;
    }
    setCreating(true);
    try {
      const email = getOrGenerateEmail(usernameInput);
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password: createPassword, displayName: createDisplayName || usernameInput }),
      });
      if (!res.ok) {
        const errBody = await safeParseJson(res).catch(() => null);
        throw new Error(errBody?.error || 'Failed to create commander.');
      }
      setGeneratedEmail(email);
      toast({ variant: 'success', title: 'Commander Created', description: `Email: ${email} | Password: ${createPassword}` });
      setShowCreateDialog(false);
      setUsernameInput('');
      setCreatePassword('');
      setCreateDisplayName('');
      fetchCommanders();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisable = async (commander: Commander) => {
    setProcessingToggle(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: commander.uid, disabled: !commander.disabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast({ variant: 'success', title: commander.disabled ? 'Commander Enabled' : 'Commander Disabled' });
      fetchCommanders();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update commander.' });
    } finally {
      setProcessingToggle(false);
    }
  };

  const handleResetPassword = async () => {
    if (!showResetDialog || !resetPassword || resetPassword.length < 6) {
      toast({ variant: 'warning', title: 'Validation Error', description: 'Password must be at least 6 characters.' });
      return;
    }
    setResetting(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: showResetDialog.uid, resetPassword: true, password: resetPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      toast({ variant: 'success', title: 'Password Reset', description: `New password: ${resetPassword}. Commander must change on next login.` });
      setShowResetDialog(null);
      setResetPassword('');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset password.' });
    } finally {
      setResetting(false);
    }
  };

  const handleDeletePermanent = async (commander: Commander) => {
    setProcessingDelete(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/admin/users?uid=${commander.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ variant: 'success', title: 'Commander Deleted', description: 'Account disconnected. Historical arena data preserved.' });
      fetchCommanders();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete commander.' });
    } finally {
      setProcessingDelete(false);
    }
  };

  const filtered = commanders.filter(c => {
    const matchesSearch = c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.displayName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && !c.disabled && !c.deleted) ||
      (statusFilter === 'disabled' && c.disabled && !c.deleted) ||
      (statusFilter === 'deleted' && c.deleted);
    return matchesSearch && matchesStatus;
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Commanders</h1>
          <p className="text-base text-muted-foreground">Manage platform commanders. Enter a username — email is auto-generated.</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Add Commander
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'active', 'disabled', 'deleted'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-150',
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
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">
              {search ? 'No commanders match your search.' : 'No commanders created yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card key={c.uid} className={cn(c.deleted && 'opacity-60')}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {c.deleted ? 'Deleted Commander' : c.displayName}
                      {c.deleted && <span className="text-xs text-muted-foreground ml-2">(deleted)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground mx-4">
                  <span className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5" />
                    {c.arenaCount ?? 0} arenas
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(c.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {c.lastActive ? formatDate(c.lastActive) : 'Never'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!c.deleted && (
                    <>
                      <Badge variant={c.disabled ? 'secondary' : 'default'}>
                        {c.disabled ? 'Disabled' : 'Active'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowResetDialog(c)}
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToggleConfirmCommander(c)}
                        title={c.disabled ? 'Enable' : 'Disable'}
                        disabled={processingToggle}
                      >
                        {c.disabled ? <Check className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmCommander(c)}
                        title="Delete Permanently"
                        disabled={processingDelete}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setGeneratedEmail(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Commander</DialogTitle>
            <DialogDescription>
              Enter a username — the email will be auto-generated as username@knowledgearena.app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="e.g. commander_smith"
              />
              {usernameInput && !usernameInput.includes('@') && (
                <p className="text-xs text-muted-foreground">
                  Email: <span className="font-mono text-primary">{usernameInput}@{COMMANDER_DOMAIN}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={createDisplayName}
                onChange={e => setCreateDisplayName(e.target.value)}
                placeholder="e.g. Dr. Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password * (min 6 chars)</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type="text"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => setCreatePassword(generatePassword())} title="Generate Password">
                  <Key className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {generatedEmail && (
              <div className="p-3 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Commander Created</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Email: {generatedEmail}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setGeneratedEmail(''); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !usernameInput.trim()}>
              {creating ? 'Creating...' : 'Create Commander'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Disable Dialog */}
      <AlertDialog open={toggleConfirmCommander !== null} onOpenChange={() => setToggleConfirmCommander(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleConfirmCommander?.disabled ? 'Enable Commander?' : 'Disable Commander?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleConfirmCommander?.disabled
                ? 'This Commander will regain access to all Commander features.'
                : 'This Commander will no longer be able to access Commander features until re-enabled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToggleConfirmCommander(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={processingToggle} onClick={() => { const c = toggleConfirmCommander; setToggleConfirmCommander(null); if (c) handleToggleDisable(c); }} className={toggleConfirmCommander?.disabled ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}>
              {processingToggle ? 'Processing...' : (toggleConfirmCommander?.disabled ? 'Enable' : 'Disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={showResetDialog !== null} onOpenChange={() => { setShowResetDialog(null); setResetPassword(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password for {showResetDialog?.displayName}</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new temporary password. The commander will be prompted to change it on next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                id="newPassword"
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => setResetPassword(generatePassword())}>
                <Key className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowResetDialog(null); setResetPassword(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={resetting || resetPassword.length < 6} onClick={handleResetPassword}>
              {resetting ? 'Resetting...' : 'Reset Password'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteConfirmCommander !== null} onOpenChange={() => setDeleteConfirmCommander(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commander Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the commander account from Firebase Auth. Their profile will be renamed to &quot;Deleted Commander&quot; and their created arenas, historical battles, and analytics data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmCommander(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={processingDelete}
              onClick={() => { const c = deleteConfirmCommander; setDeleteConfirmCommander(null); if (c) handleDeletePermanent(c); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processingDelete ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
