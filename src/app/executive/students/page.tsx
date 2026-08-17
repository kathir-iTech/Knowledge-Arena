'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Users, User, Ban, Check, Swords, Star, Clock, Trash2, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { BulkSelection, BulkSelectionCheckbox } from '@/components/ui/bulk-selection';

interface Gladiator {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: number;
  totalBattles: number;
  avgScore: number;
  lastActive: number | null;
}

export default function StudentManagementPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [gladiators, setGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [summary, setSummary] = useState({ total: 0, active: 0, disabled: 0 });
  const [selectedGladiator, setSelectedGladiator] = useState<Gladiator | null>(null);
  const [toggleConfirmGladiator, setToggleConfirmGladiator] = useState<Gladiator | null>(null);
  const [deleteConfirmGladiator, setDeleteConfirmGladiator] = useState<Gladiator | null>(null);
  const [processingToggle, setProcessingToggle] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const getToken = async (): Promise<string> => {
    const firebaseAuth = auth as any;
    if (firebaseAuth?.currentUser) {
      return await firebaseAuth.currentUser.getIdToken();
    }
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (firebaseAuth?.currentUser) {
        return await firebaseAuth.currentUser.getIdToken();
      }
    }
    throw new Error('Not authenticated');
  };

  const fetchGladiators = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/users?role=gladiator', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const users = data.users || [];
      setGladiators(users);
      setSummary({
        total: users.length,
        active: users.filter((u: Gladiator) => !u.disabled).length,
        disabled: users.filter((u: Gladiator) => u.disabled).length,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load gladiators.' });
    } finally {
      setLoading(false);
    }
  }, [auth, toast]);

  useEffect(() => {
    if (user) fetchGladiators();
  }, [user, fetchGladiators]);

  const handleToggleDisable = async (gladiator: Gladiator) => {
    setProcessingToggle(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: gladiator.uid, disabled: !gladiator.disabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast({ title: gladiator.disabled ? 'Account Enabled' : 'Account Disabled' });
      fetchGladiators();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update gladiator.' });
    } finally {
      setProcessingToggle(false);
    }
  };

  const handleDeletePermanent = async (gladiator: Gladiator) => {
    setProcessingDelete(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users?uid=${gladiator.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Gladiator Deleted', description: 'Account permanently removed. Historical battle records preserved.' });
      fetchGladiators();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete gladiator.' });
    } finally {
      setProcessingDelete(false);
    }
  };

  const handleBulkToggle = async (ids: string[], disable: boolean) => {
    try {
      const token = await getToken();
      await Promise.all(ids.map(uid =>
        fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid, disabled: disable }),
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      ));
      toast({ title: disable ? 'Disabled' : 'Enabled', description: `${ids.length} gladiator(s) updated.` });
      setSelectedIds([]);
      fetchGladiators();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update one or more gladiators.' });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    setProcessingDelete(true);
    try {
      const token = await getToken();
      await Promise.all(ids.map(uid =>
        fetch(`/api/admin/users?uid=${uid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      ));
      toast({ title: 'Deleted', description: `${ids.length} gladiator(s) removed.` });
      setSelectedIds([]);
      fetchGladiators();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete one or more gladiators.' });
    } finally {
      setProcessingDelete(false);
    }
  };

  const filtered = gladiators.filter(g => {
    const matchesSearch = g.email.toLowerCase().includes(search.toLowerCase()) ||
      g.displayName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && !g.disabled) ||
      (statusFilter === 'disabled' && g.disabled);
    return matchesSearch && matchesStatus;
  });

  const formatDate = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-in">
      <div className="space-y-1.5 mb-6">
        <h1 className="text-page-title font-headline tracking-tight">Gladiators</h1>
        <p className="text-base text-muted-foreground">Manage gladiator accounts and view activity stats.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-success">{summary.active}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{summary.disabled}</p>
            <p className="text-sm text-muted-foreground">Disabled</p>
          </CardContent>
        </Card>
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
          {(['all', 'active', 'disabled'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
            allIds={filtered.map(g => g.uid)}
            actions={[
              { label: 'Activate', icon: Check, onClick: (ids) => handleBulkToggle(ids, false), variant: 'default' },
              { label: 'Disable', icon: Ban, onClick: (ids) => handleBulkToggle(ids, true), variant: 'secondary' },
              { label: 'Delete', icon: Trash2, onClick: handleBulkDelete, variant: 'destructive', disabled: processingDelete },
            ]}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">
              {search ? 'No gladiators match your search.' : 'No gladiators registered yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(g => (
            <Card key={g.uid}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <BulkSelectionCheckbox id={g.uid} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-sm font-medium">
                      {g.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <button
                      onClick={() => router.push(`/executive/students/${g.uid}`)}
                      className="font-medium truncate group-hover:text-primary transition-colors duration-300 hover:text-primary hover:underline underline-offset-2 text-left rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      title="View full profile"
                    >
                      {g.displayName}
                    </button>
                    <p className="text-sm text-muted-foreground truncate">{g.email}</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground mx-4">
                  <span className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5" />
                    {g.totalBattles ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />
                    {g.avgScore ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {g.lastActive ? formatDate(g.lastActive) : 'Never'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedGladiator(g)}
                    title="Quick profile"
                  >
                    <User className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/executive/students/${g.uid}`)}
                    title="View full profile"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Badge variant={g.disabled ? 'secondary' : 'default'}>
                    {g.disabled ? 'Disabled' : 'Active'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToggleConfirmGladiator(g)}
                    title={g.disabled ? 'Re-enable' : 'Disable'}
                    disabled={processingToggle}
                  >
                    {g.disabled ? <Check className="w-4 h-4 text-success" /> : <Ban className="w-4 h-4 text-warning" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmGladiator(g)}
                    title="Delete Permanently"
                    disabled={processingDelete}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedGladiator} onOpenChange={(open) => { if (!open) setSelectedGladiator(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gladiator Profile</DialogTitle>
          </DialogHeader>
          {selectedGladiator && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-2xl font-medium">
                    {selectedGladiator.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{selectedGladiator.displayName}</p>
                  <p className="text-sm text-muted-foreground">{selectedGladiator.email}</p>
                  <Badge variant={selectedGladiator.disabled ? 'secondary' : 'default'} className="mt-1">
                    {selectedGladiator.disabled ? 'Disabled' : 'Active'}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Total Battles</p>
                  <p className="font-semibold text-lg">{selectedGladiator.totalBattles ?? 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Average Score</p>
                  <p className="font-semibold text-lg">{selectedGladiator.avgScore ?? 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Joined</p>
                  <p className="font-semibold">{selectedGladiator.createdAt ? formatDate(selectedGladiator.createdAt) : 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Last Active</p>
                  <p className="font-semibold">{selectedGladiator.lastActive ? formatDate(selectedGladiator.lastActive) : 'Never'}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => { const uid = selectedGladiator.uid; setSelectedGladiator(null); router.push(`/executive/students/${uid}`); }}>
                View Full Profile
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toggleConfirmGladiator !== null} onOpenChange={() => setToggleConfirmGladiator(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleConfirmGladiator?.disabled ? 'Re-enable Gladiator?' : 'Disable Gladiator?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleConfirmGladiator?.disabled
                ? 'This gladiator will regain access to all features and battles.'
                : 'This gladiator will no longer be able to log in or participate in battles until re-enabled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToggleConfirmGladiator(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={processingToggle} onClick={() => { const g = toggleConfirmGladiator; setToggleConfirmGladiator(null); if (g) handleToggleDisable(g); }} className={toggleConfirmGladiator?.disabled ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}>
              {processingToggle ? 'Processing...' : (toggleConfirmGladiator?.disabled ? 'Re-enable' : 'Disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmGladiator !== null} onOpenChange={() => setDeleteConfirmGladiator(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gladiator Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the account and login access for {deleteConfirmGladiator?.displayName}. Completed historical battle records will be preserved for analytical accuracy, but the user will no longer be able to log in or appear as an active registered Gladiator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmGladiator(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={processingDelete}
              onClick={() => { const g = deleteConfirmGladiator; setDeleteConfirmGladiator(null); if (g) handleDeletePermanent(g); }}
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
