"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, BrainCircuit, LayoutDashboard, BarChart3, Shield, Users, BookOpen, Layers, Inbox, Settings, MessageSquare, ClipboardList, Activity, Database, Wifi, Search, Bell, User, Archive } from 'lucide-react';
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

const ExecutiveSidebar = () => {
  const { user, logout } = useAuth();
  const { auth } = useFirebase();
  const pathname = usePathname();
  const [isAvatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const [convRes, notifRes] = await Promise.all([
          fetch('/api/messaging/conversations', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/executive/notifications?unreadOnly=true', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!cancelled) {
          if (convRes.ok) {
            const convData = await convRes.json();
            const total = (convData.conversations || []).reduce(
              (sum: number, c: any) => sum + (c.unreadCount?.[user.id] || 0), 0
            );
            setUnreadCount(total);
          }
          if (notifRes.ok) {
            const notifData = await notifRes.json();
            setNotifCount(notifData.unreadCount || 0);
          }
        }
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, auth]);

  if (!user) return null;

  const nav = [
    { href: '/executive/workspace', label: 'Workspace', icon: LayoutDashboard },
    { href: '/executive/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/executive/search', label: 'Search', icon: Search },
    { href: '/executive/commanders', label: 'Commanders', icon: Shield },
    { href: '/executive/students', label: 'Students', icon: Users },
    { href: '/executive/question-bank', label: 'Question Bank', icon: BookOpen },
    { href: '/executive/question-sets', label: 'Question Sets', icon: Layers },
    { href: '/executive/requests', label: 'Requests', icon: Inbox },
    { href: '/executive/messages', label: 'Messages', icon: MessageSquare },
    { href: '/executive/notifications', label: 'Notifications', icon: Bell },
    { href: '/executive/audit-logs', label: 'Audit Logs', icon: ClipboardList },
    { href: '/executive/settings', label: 'Settings', icon: Settings },
    { href: '/executive/backup', label: 'Backup', icon: Archive },
  ];

  const secondaryNav = [
    { href: '/executive/profile', label: 'Profile', icon: User },
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
            <span className="text-sm font-headline font-semibold text-foreground whitespace-nowrap hidden group-data-[collapsed=false]:block tracking-tight">Knowledge Arena</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0.5">
          {user && (
            <div className="mx-2 mb-2 pt-1">
              <button onClick={() => setAvatarEditorOpen(true)} className="flex items-center gap-3 w-full text-left rounded-[10px] p-2.5 transition-colors hover:bg-sidebar-accent group" aria-label="Change avatar">
                <Avatar className="h-9 w-9 shrink-0 ring-2 ring-sidebar-border ring-offset-1 ring-offset-sidebar">
                  {user.avatar.startsWith('http') ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                  <AvatarFallback className="bg-sidebar-accent text-sm font-medium">
                    {user.avatar.startsWith('http')
                      ? (user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')
                      : user.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden hidden group-data-[collapsed=false]:flex min-w-0">
                  <span className="font-medium text-sm truncate leading-tight text-sidebar-accent-foreground">{user.name}</span>
                  <span className="text-[11px] text-sidebar-foreground capitalize leading-tight">Executive</span>
                </div>
              </button>
            </div>
          )}
          <SidebarSeparator className="mb-1" />
          <SidebarMenu>
            {nav.map((item) => {
              const active = isActive(item.href);
              const hasBadge = (item.href === '/executive/messages' && unreadCount > 0) || (item.href === '/executive/notifications' && notifCount > 0);
              const badgeCount = item.href === '/executive/messages' ? unreadCount : item.href === '/executive/notifications' ? notifCount : 0;
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
                      {hasBadge && badgeCount > 0 && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          <SidebarSeparator className="my-1" />
          <SidebarMenu>
            {secondaryNav.map((item) => {
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                    className={cn(active && "bg-primary/10 text-primary font-medium hover:bg-primary/10 hover:text-primary")}
                  >
                    <Link href={item.href}>
                      <item.icon className={cn("!size-[18px]", active && "text-primary")} />
                      <span>{item.label}</span>
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
              <SidebarMenuButton onClick={logout} tooltip="Log Out" className="text-sidebar-foreground hover:text-destructive hover:bg-destructive/5">
                <LogOut className="!size-[18px]" />
                <span>Log Out</span>
              </SidebarMenuButton>
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

export default ExecutiveSidebar;
