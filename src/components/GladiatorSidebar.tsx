
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LayoutDashboard, BrainCircuit, Swords, UserCircle, Bell } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AvatarEditor } from './AvatarEditor';
import { cn } from '@/lib/utils';
import { QUIZ_ABANDONED_AFTER_MS } from '@/lib/constants';
import { collectionGroup, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';

const GladiatorSidebar = () => {
  const { user, logout } = useAuth();
  const { auth, firestore } = useFirebase();
  const pathname = usePathname();
  const [isAvatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [isInBattle, setIsInBattle] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/notifications?unreadOnly=true', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setNotifCount(data.unreadCount || 0);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, auth]);

  // Part 6B: real-time listener (replaces 15s polling) + zombie staleness.
  // Listens to participants COLLECTION_GROUP where user_id==uid; on change
  // fetches parent quizzes and applies QUIZ_ABANDONED_AFTER_MS staleness so
  // a zombie live arena does not trap logout. Reads only on actual changes.
  useEffect(() => {
    if (!user) {
      setIsInBattle(false);
      return;
    }
    const uid = user.id;
    const partsQ = query(collectionGroup(firestore, 'participants'), where('user_id', '==', uid));
    let cancelled = false;
    const unsub = onSnapshot(
      partsQ,
      async partsSnap => {
        try {
          const activeParts = partsSnap.docs.filter(d => {
            const s = d.data()?.status;
            return s === 'playing' || s === 'waiting' || s === 'live';
          });
          if (activeParts.length === 0) {
            if (!cancelled) setIsInBattle(false);
            return;
          }
          const quizIds = activeParts.map(d => d.ref.parent.parent?.id).filter(Boolean) as string[];
          const uniqIds = Array.from(new Set(quizIds));
          const quizDocs = await Promise.all(uniqIds.map(id => getDoc(doc(firestore, 'quizzes', id))));
          let hasActive = false;
          for (const qd of quizDocs) {
            if (!qd.exists()) continue;
            const data = qd.data() as any;
            const status: string = data.status;
            const isActiveStatus =
              status === 'waiting' || status === 'ready' || status === 'starting' || status === 'live' || status === 'paused';
            if (!isActiveStatus) continue;
            if (status === 'live') {
              const qsa = data.question_start_at;
              const lastMs = typeof qsa === 'number' ? qsa : (qsa?.toMillis?.() ?? 0);
              if (lastMs && Date.now() - lastMs >= QUIZ_ABANDONED_AFTER_MS) continue;
            }
            if (status === 'waiting') {
              const created = typeof data.created_at === 'number' ? data.created_at : 0;
              if (created && Date.now() - created >= QUIZ_ABANDONED_AFTER_MS) continue;
            }
            hasActive = true;
            break;
          }
          if (!cancelled) setIsInBattle(hasActive);
        } catch (e) {
          console.error('[GladiatorSidebar] battle status check failed', e);
          if (!cancelled) setIsInBattle(false);
        }
      },
      err => {
        console.error('[GladiatorSidebar] participants listener failed', err);
        if (!cancelled) setIsInBattle(false);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user, firestore]);

  if (!user) return null;

  const nav = [
    { href: '/gladiator/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/gladiator/history', label: 'Battle History', icon: Swords },
    { href: '/gladiator/notifications', label: 'Notifications', icon: Bell },
    { href: '/gladiator/profile', label: 'Profile', icon: UserCircle },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <Sidebar>
        <SidebarHeader className="pb-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-primary/10 shrink-0">
              <BrainCircuit className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <span className="text-sm font-headline font-semibold text-foreground whitespace-nowrap hidden group-data-[collapsed=false]:block tracking-tight">Quorena</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0.5">
          {user && (
            <div className="mx-2 mb-2 pt-1">
              <button onClick={() => setAvatarEditorOpen(true)} className="flex items-center gap-3 w-full text-left rounded-[10px] p-2.5 transition-colors hover:bg-sidebar-accent group" aria-label="Change avatar">
                <Avatar className="h-9 w-9 shrink-0 ring-2 ring-sidebar-border ring-offset-1 ring-offset-sidebar">
                  {user.avatar?.startsWith('http') ? <AvatarImage src={user.avatar} alt={user.name || ''} /> : null}
                  <AvatarFallback className="bg-sidebar-accent text-sm font-medium">
                    {user.avatar?.startsWith('http')
                      ? ((user.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')
                      : (user.avatar || '🎮')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden hidden group-data-[collapsed=false]:flex min-w-0">
                  <span className="font-medium text-sm truncate leading-tight text-sidebar-accent-foreground">{user.name || 'User'}</span>
                  <span className="text-[11px] text-sidebar-foreground capitalize leading-tight">Gladiator</span>
                </div>
              </button>
            </div>
          )}
          <SidebarSeparator className="mb-1" />
          <SidebarMenu>
            {nav.map((item) => {
              const active = isActive(item.href);
              const hasBadge = item.href === '/gladiator/notifications' && notifCount > 0;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                    className={cn(
                      active && "bg-primary/10 text-primary font-medium hover:bg-primary/10 hover:text-primary",
                      !active && hasBadge && "relative"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className={cn("!size-[18px]", active && "text-primary")} />
                      <span>{item.label}</span>
                      {hasBadge && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                          {notifCount > 9 ? '9+' : notifCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/50 pt-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={isInBattle ? undefined : logout}
                tooltip={isInBattle ? 'Logout disabled while in battle' : 'Log Out'}
                className={cn(
                  'text-sidebar-foreground hover:text-destructive hover:bg-destructive/5',
                  isInBattle && 'opacity-50 pointer-events-none'
                )}
                aria-disabled={isInBattle}
                aria-label={isInBattle ? 'Logout disabled while in battle' : 'Log Out'}
              >
                <LogOut className="!size-[18px]" />
                <span>{isInBattle ? "Logout is disabled while you're in an active battle." : 'Log Out'}</span>
              </SidebarMenuButton>
              {isInBattle && (
                <p className="text-[11px] text-muted-foreground px-3 pt-1 leading-tight">Logout is disabled while you&apos;re in an active battle.</p>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {user && (
          <AvatarEditor
            isOpen={isAvatarEditorOpen}
            setIsOpen={setAvatarEditorOpen}
            currentAvatar={user.avatar}
          />
      )}
    </>
  );
};

export default GladiatorSidebar;
