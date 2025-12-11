"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Swords, Trophy, LogOut, BotMessageSquare } from 'lucide-react';
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

  const navItems = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/create-quiz', label: 'Create Quiz', icon: Swords, teacherOnly: true },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-8 h-8 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Cyber Gladiators</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              if (item.teacherOnly && user?.role !== 'Teacher') {
                return null;
              }
              const isActive = pathname === item.href;
              return (
                <SidebarMenuItem key={item.label}>
                  <Link href={item.href} passHref>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {user && (
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="w-full justify-start p-2 h-auto"
                onClick={() => setAvatarEditorOpen(true)}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-muted text-2xl">{user.avatar}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start ml-3">
                  <span className="font-semibold text-sm">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.role}</span>
                </div>
              </Button>
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
