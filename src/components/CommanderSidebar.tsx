
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LayoutDashboard, BrainCircuit, PencilRuler, History, UserCircle } from 'lucide-react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AvatarEditor } from './AvatarEditor';
import { cn } from '@/lib/utils';

const CommanderSidebar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isAvatarEditorOpen, setAvatarEditorOpen] = useState(false);

  if (!user) return null;

  const nav = [
    { href: '/commander/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/create-quiz', label: 'Create Arena', icon: PencilRuler },
    { href: '/commander/history', label: 'Battle History', icon: History },
    { href: '/commander/profile', label: 'Profile', icon: UserCircle },
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
                  <AvatarFallback className="bg-sidebar-accent text-sm font-medium">{user.avatar}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden hidden group-data-[collapsed=false]:flex min-w-0">
                  <span className="font-medium text-sm truncate leading-tight text-sidebar-accent-foreground">{user.name}</span>
                  <span className="text-[11px] text-sidebar-foreground capitalize leading-tight">Commander</span>
                </div>
              </button>
            </div>
          )}
          <SidebarSeparator className="mb-1" />
          <SidebarMenu>
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                    className={cn(
                      active && "bg-primary/10 text-primary font-medium hover:bg-primary/10 hover:text-primary"
                    )}
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

export default CommanderSidebar;
