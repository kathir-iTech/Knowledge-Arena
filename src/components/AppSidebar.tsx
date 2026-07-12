
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LayoutDashboard, BrainCircuit, PencilRuler, BarChart3 } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AvatarEditor } from './AvatarEditor';

const AppSidebar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isAvatarEditorOpen, setAvatarEditorOpen] = useState(false);
  
  if (!user) {
    return null; 
  }

  const isTeacher = user.role === 'teacher';

  const navItems = isTeacher
    ? [
        { href: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/create-quiz', label: 'Create Quiz', icon: PencilRuler },
        { href: '/teacher/analytics', label: 'Analytics', icon: BarChart3 },
      ]
    : [
        { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ];

  return (
    <>
      <Sidebar>
        <SidebarHeader className="pb-2">
          <div className="flex items-center gap-3 px-2">
            <div className="relative">
              <BrainCircuit className="w-9 h-9 text-primary" aria-hidden="true" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full animate-pulse-soft" />
            </div>
            <span className="text-base font-headline font-bold text-primary whitespace-nowrap hidden group-data-[collapsed=false]:block tracking-tight">Knowledge Arena</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-1">
            {user && (
              <div className="mx-2 mb-2 p-2.5 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/40 transition-colors hover:bg-sidebar-accent/80">
                <button onClick={() => setAvatarEditorOpen(true)} className="flex items-center gap-3 w-full text-left" aria-label="Change avatar">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20 shrink-0">
                    <AvatarFallback className="bg-muted text-xl">{user.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col overflow-hidden hidden group-data-[collapsed=false]:flex min-w-0">
                    <span className="font-semibold text-sm truncate">{user.name}</span>
                    <span className="text-[11px] text-muted-foreground capitalize">{user.role}</span>
                  </div>
                </button>
              </div>
            )}
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label} className="group/menu-button">
                  <Link href={item.href}>
                    <item.icon className="!w-4 !h-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/40 pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Log Out" className="text-muted-foreground hover:text-foreground transition-colors">
                <LogOut className="!w-4 !h-4" />
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

export default AppSidebar;
