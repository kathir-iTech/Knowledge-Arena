
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
            <span className="text-lg font-headline font-bold text-primary whitespace-nowrap hidden group-data-[collapsed=false]:inline">Knowledge Arena</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
            {user && (
                 <div className="flex items-center gap-3 rounded-md p-2 text-left w-full bg-sidebar-accent mb-4">
                   <button onClick={() => setAvatarEditorOpen(true)} className="shrink-0">
                        <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-2xl">{user.avatar}</AvatarFallback>
                        </Avatar>
                   </button>
                    <div className="flex flex-col items-start overflow-hidden hidden group-data-[collapsed=false]:flex">
                        <span className="font-semibold text-sm whitespace-nowrap">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.role}</span>
                    </div>
                </div>
            )}
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
             <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton onClick={logout} tooltip="Log Out">
                        <LogOut />
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
