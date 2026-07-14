'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Plus, Search, X, Check, Ban } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface Commander {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: number;
}

export default function CommanderManagementPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [commanders, setCommanders] = useState<Commander[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCommanders = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/users?role=commander', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCommanders(data.users || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load commanders.' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) fetchCommanders();
  }, [user, fetchCommanders]);

  const handleCreate = async () => {
    if (!createEmail || !createPassword) {
      toast({ variant: 'destructive', title: 'Error', description: 'Email and password are required.' });
      return;
    }
    setCreating(true);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: createEmail, password: createPassword, displayName: createDisplayName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }
      toast({ title: 'Commander Created', description: `${createEmail} has been added.` });
      setShowCreateDialog(false);
      setCreateEmail('');
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
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: commander.uid, disabled: !commander.disabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast({ title: commander.disabled ? 'Commander Enabled' : 'Commander Disabled' });
      fetchCommanders();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update commander.' });
    }
  };

  const filtered = commanders.filter(
    c =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.displayName.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-page-title font-headline tracking-tight">Commanders</h1>
          <p className="text-base text-muted-foreground">Manage platform commanders and their permissions.</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Commander
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
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
            <Card key={c.uid}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{c.displayName}</p>
                    <p className="text-sm text-muted-foreground">{c.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.disabled ? 'secondary' : 'default'}>
                    {c.disabled ? 'Disabled' : 'Active'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleDisable(c)}
                    title={c.disabled ? 'Enable' : 'Disable'}
                  >
                    {c.disabled ? <Check className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Commander</DialogTitle>
            <DialogDescription>
              Create a new commander account. The commander will receive login credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                placeholder="commander@school.edu"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={createPassword}
                onChange={e => setCreatePassword(e.target.value)}
                placeholder="Min 6 characters"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Commander'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
