"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LayoutDashboard, BrainCircuit, PencilRuler } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { AvatarEditor } from './AvatarEditor';

const AppSidebar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isAvatarEditorOpen, setAvatarEditorOpen] = useState(false);
  
  if (!user) {
    return null; 
  }

  const isTeacher = user.role === 'Teacher';

  const navItems = isTeacher
    ? [
        { href: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/create-quiz', label: 'Create Quiz', icon: PencilRuler },
      ]
    : [
        { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ];

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-10 h-10 text-primary" />
            <span className="text-lg font-headline font-bold text-primary whitespace-nowrap">Knowledge Arena</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <Link href={item.href} passHref>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <>
                      <item.icon />
                      <span>{item.label}</span>
                    </>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {user && (
            <div className="flex items-center gap-2">
               <button
                className="flex items-center gap-3 text-left w-full hover:bg-sidebar-accent rounded-md p-2"
                onClick={() => setAvatarEditorOpen(true)}
               >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-muted text-2xl">{user.avatar}</AvatarFallback>
                </Avatar>
                <div className="flex-col items-start hidden group-data-[collapsed=false]:flex">
                  <span className="font-semibold text-sm whitespace-nowrap">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.role}</span>
                </div>
               </button>
              <Button variant="ghost" size="icon" onClick={logout} className="shrink-0">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          )}
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
