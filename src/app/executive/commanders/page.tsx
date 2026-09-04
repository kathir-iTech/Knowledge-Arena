'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Plus, Search, Check, Ban, Swords, Clock, Calendar, Key, Trash2, CheckSquare, ChevronRight, Copy, CheckCircle2 as CheckCircle, AlertCircle } from 'lucide-react';
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
import { BulkSelection, BulkSelectionCheckbox } from '@/components/ui/bulk-selection';

const COMMANDER_DOMAIN = 'knowledgearena.app';

interface Commander {
  uid: string;
  email: string;
  displayName: string;
  institution_domain?: string | null;
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
  const trimmed = input.trim();
  if (!trimmed) return 'Username is required.';
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
    return null;
  }
  if (trimmed.length < 3) return 'Username must be at least 3 characters.';
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return 'Username can only contain letters, numbers, underscores, hyphens, and dots.';
  return null;
}

export default function CommanderManagementPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [commanders, setCommanders] = useState<Commander[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'deleted'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createInstitutionDomain, setCreateInstitutionDomain] = useState('psgitech.ac.in');
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<{ username?: string; password?: string; institution_domain?: string }>({});
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; displayName?: string } | null>(null);
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<{ email: string; password: string; displayName?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toggleConfirmCommander, setToggleConfirmCommander] = useState<Commander | null>(null);
  const [processingToggle, setProcessingToggle] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<Commander | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [deleteConfirmCommander, setDeleteConfirmCommander] = useState<Commander | null>(null);
  const [processingDelete, setProcessingDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    const passwordError = !createPassword || createPassword.length < 6 ? 'Password must be at least 6 characters.' : null;
    const instRaw = createInstitutionDomain.trim().toLowerCase();
    const instError = instRaw && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(instRaw) ? 'Use a domain like psgitech.ac.in or leave blank for open.' : null;
    const nextErrors: { username?: string; password?: string; institution_domain?: string } = {};
    if (usernameError) nextErrors.username = usernameError;
    if (passwordError) nextErrors.password = passwordError;
    if (instError) nextErrors.institution_domain = instError;
    setCreateErrors(nextErrors);
    if (usernameError || passwordError || instError) return;
    setCreating(true);
    setCreateErrors({});
    try {
      const email = getOrGenerateEmail(usernameInput.trim());
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password: createPassword, displayName: createDisplayName.trim() || usernameInput.trim(), institution_domain: instRaw || null }),
      });
      if (!res.ok) {
        const errBody = await safeParseJson(res).catch(() => null);
        throw new Error(errBody?.error || 'Failed to create commander.');
      }
      const creds = { email, password: createPassword, displayName: createDisplayName.trim() || usernameInput.trim() };
      setCreatedCredentials(creds);
      setLastCreatedCredentials(creds);
      toast({ variant: 'success', title: 'Commander Created', description: `Email: ${email}` });
      setUsernameInput('');
      setCreatePassword('');
      setCreateDisplayName('');
      setCreateInstitutionDomain('psgitech.ac.in');
      setCreateErrors({});
      fetchCommanders();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({ title: 'Copied', description: `${field} copied to clipboard.` });
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Copy Failed', description: 'Please copy manually.' });
    }
  };

  const handleCloseCreateDialog = (open: boolean) => {
    if (!open) {
      if (createdCredentials) return; // stay open on success state until Done
      setShowCreateDialog(false);
      setCreateErrors({});
      setCreatedCredentials(null);
    }
  };

  const handleDoneCreate = () => {
    setShowCreateDialog(false);
    setCreatedCredentials(null);
    setCreateErrors({});
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

  const handleBulkDelete = async (ids: string[]) => {
    setProcessingDelete(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      await Promise.all(ids.map(uid =>
        fetch(`/api/admin/users?uid=${uid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      ));
      toast({ variant: 'success', title: 'Deleted', description: `${ids.length} commander(s) removed.` });
      setSelectedIds([]);
      fetchCommanders();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete one or more commanders.' });
    } finally {
      setProcessingDelete(false);
    }
  };

  const handleBulkToggle = async (ids: string[], disable: boolean) => {
    try {
      const token = await auth.currentUser!.getIdToken();
      await Promise.all(ids.map(uid =>
        fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid, disabled: disable }),
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      ));
      toast({ variant: 'success', title: disable ? 'Disabled' : 'Enabled', description: `${ids.length} commander(s) updated.` });
      setSelectedIds([]);
      fetchCommanders();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update one or more commanders.' });
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
        <Button onClick={() => { setCreatedCredentials(null); setCreateErrors({}); setShowCreateDialog(true); }} className="w-full sm:w-auto">
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
                'px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-300 ease-out',
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

      {filtered.length > 0 && (
        <div className="mb-3">
          <BulkSelection
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            allIds={filtered.map(c => c.uid)}
            actions={[
              { label: 'Activate', icon: Check, onClick: (ids) => handleBulkToggle(ids, false), variant: 'default' },
              { label: 'Disable', icon: Ban, onClick: (ids) => handleBulkToggle(ids, true), variant: 'secondary' },
              { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'destructive', disabled: processingDelete },
            ]}
          />
        </div>
      )}

      {lastCreatedCredentials && !showCreateDialog && (
        <Card className="mb-4 border-success/30 bg-success/5">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-success mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-success">Commander created — credentials (copy now, password won&apos;t be shown again)</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono bg-background border rounded px-2 py-1">{lastCreatedCredentials.email}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyToClipboard(lastCreatedCredentials.email, 'Email')}>
                      {copiedField === 'Email' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy email
                    </Button>
                    <span className="font-mono bg-background border rounded px-2 py-1">{lastCreatedCredentials.password}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyToClipboard(lastCreatedCredentials.password, 'Password')}>
                      {copiedField === 'Password' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy password
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyToClipboard(`${lastCreatedCredentials.email} / ${lastCreatedCredentials.password}`, 'Credentials')}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copy both
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this login with the Commander. They will be prompted to change the password on first sign-in.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastCreatedCredentials(null)} className="shrink-0">Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base font-medium">
              {search || statusFilter !== 'all' ? 'No commanders match your filters.' : 'No commanders yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all' ? 'Try adjusting your search or status filter.' : 'Add your first commander to get started.'}
            </p>
            {(search || statusFilter !== 'all') && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Clear filters
              </Button>
            )}
            {!search && statusFilter === 'all' && (
              <Button className="mt-4" onClick={() => { setCreatedCredentials(null); setCreateErrors({}); setShowCreateDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Add Commander
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card key={c.uid} className={cn(c.deleted && 'opacity-60')}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <BulkSelectionCheckbox id={c.uid} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <button
                      onClick={() => router.push(`/executive/commanders/${c.uid}`)}
                      className="font-medium truncate group-hover:text-primary transition-colors hover:text-primary hover:underline underline-offset-2 text-left"
                      title="View profile"
                    >
                      {c.displayName}
                    </button>
                    <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                    <p className="text-xs truncate">
                      {c.institution_domain ? (
                        <span className="font-mono bg-secondary rounded px-1.5 py-0.5">@{c.institution_domain}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Open (no domain)</span>
                      )}
                    </p>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/executive/commanders/${c.uid}`)}
                    title="View Profile"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
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
      <Dialog open={showCreateDialog} onOpenChange={handleCloseCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          {!createdCredentials ? (
            <>
              <DialogHeader>
                <DialogTitle>Add Commander</DialogTitle>
                <DialogDescription>
                  Enter a username — the email will be auto-generated as username@{COMMANDER_DOMAIN}. The login email will be shown clearly after creation.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Username or email *</Label>
                  <Input
                    id="username"
                    value={usernameInput}
                    onChange={e => { setUsernameInput(e.target.value); if (createErrors.username) setCreateErrors(prev => ({ ...prev, username: undefined })); }}
                    placeholder="e.g. commander_smith or smith@college.edu"
                    aria-invalid={!!createErrors.username}
                    disabled={creating}
                  />
                  {createErrors.username && (
                    <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createErrors.username}</p>
                  )}
                  {usernameInput.trim() && !createErrors.username && (
                    <p className="text-xs text-muted-foreground">
                      Login email: <span className="font-mono font-medium text-primary">{getOrGenerateEmail(usernameInput.trim())}</span>
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
                    disabled={creating}
                  />
                  <p className="text-xs text-muted-foreground">Shown in rosters and analytics. Defaults to username if empty.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password * (min 6 chars)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      type="text"
                      value={createPassword}
                      onChange={e => { setCreatePassword(e.target.value); if (createErrors.password) setCreateErrors(prev => ({ ...prev, password: undefined })); }}
                      placeholder="Min 6 characters"
                      className="flex-1 font-mono"
                      aria-invalid={!!createErrors.password}
                      disabled={creating}
                    />
                    <Button variant="outline" size="sm" onClick={() => { setCreatePassword(generatePassword()); setCreateErrors(prev => ({ ...prev, password: undefined })); }} title="Generate Password" disabled={creating}>
                      <Key className="w-4 h-4" />
                    </Button>
                  </div>
                  {createErrors.password ? (
                    <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createErrors.password}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">The commander will be asked to change this on first login.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institutionDomain">Institution domain</Label>
                  <Input
                    id="institutionDomain"
                    value={createInstitutionDomain}
                    onChange={e => { setCreateInstitutionDomain(e.target.value); if (createErrors.institution_domain) setCreateErrors(prev => ({ ...prev, institution_domain: undefined })); }}
                    placeholder="psgitech.ac.in (blank = open to anyone)"
                    aria-invalid={!!createErrors.institution_domain}
                    disabled={creating}
                  />
                  {createErrors.institution_domain ? (
                    <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createErrors.institution_domain}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Gladiators must have this email domain to join this commander&apos;s arenas. Blank = open.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowCreateDialog(false); setCreateErrors({}); }} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" /> Creating...</> : 'Create Commander'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-success" /> Commander Created</DialogTitle>
                <DialogDescription>
                  Share these credentials with the commander. The password will not be shown again after closing.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Login email</Label>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-sm font-medium bg-background border rounded px-3 py-2 truncate">{createdCredentials.email}</span>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdCredentials.email, 'Login email')}>
                        {copiedField === 'Login email' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Temporary password</Label>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-sm font-medium bg-background border rounded px-3 py-2 truncate">{createdCredentials.password}</span>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdCredentials.password, 'Password')}>
                        {copiedField === 'Password' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
                      </Button>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => copyToClipboard(`${createdCredentials.email} / ${createdCredentials.password}`, 'Credentials')}>
                    <Copy className="w-4 h-4 mr-2" /> Copy both
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">The commander logs in with email + password and will be prompted to change the password on first sign-in.</p>
              </div>
              <DialogFooter>
                <Button onClick={handleDoneCreate} className="w-full">Done</Button>
              </DialogFooter>
            </>
          )}
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
