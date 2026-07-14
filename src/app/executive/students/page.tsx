'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Users, User, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Gladiator {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: number;
}

export default function StudentManagementPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [gladiators, setGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ total: 0, active: 0, disabled: 0 });

  const fetchGladiators = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
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
  }, [user, toast]);

  useEffect(() => {
    if (user) fetchGladiators();
  }, [user, fetchGladiators]);

  const filtered = gladiators.filter(
    g =>
      g.email.toLowerCase().includes(search.toLowerCase()) ||
      g.displayName.toLowerCase().includes(search.toLowerCase())
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
      <div className="space-y-1.5 mb-6">
        <h1 className="text-page-title font-headline tracking-tight">Gladiators</h1>
        <p className="text-base text-muted-foreground">View registered gladiator accounts and activity.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{summary.active}</p>
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
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-sm font-medium">
                      {g.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{g.displayName}</p>
                    <p className="text-sm text-muted-foreground">{g.email}</p>
                  </div>
                </div>
                <Badge variant={g.disabled ? 'secondary' : 'default'}>
                  {g.disabled ? 'Disabled' : 'Active'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
