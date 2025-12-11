"use client";

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/lib/types';
import { findUserByEmail, createUser, updateUser } from '@/lib/mock-data';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string }) => Promise<void>;
  signup: (credentials: { name: string; email: string }) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatar: string) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('cyber-gladiator-user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('cyber-gladiator-user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleUserUpdate = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('cyber-gladiator-user', JSON.stringify(updatedUser));
  }, []);

  const login = async (credentials: { email: string }) => {
    const existingUser = findUserByEmail(credentials.email);
    if (existingUser) {
      handleUserUpdate(existingUser);
    } else {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "No account found with that email. Please sign up.",
      });
      throw new Error("User not found");
    }
  };

  const signup = async (credentials: { name: string; email: string }) => {
    if (findUserByEmail(credentials.email)) {
      toast({
        variant: "destructive",
        title: "Signup Failed",
        description: "An account with this email already exists.",
      });
      throw new Error("User already exists");
    }

    const role = credentials.email.endsWith('@staffs.com') ? 'Teacher' : 'Student';
    const newUser = createUser({
      name: credentials.name,
      email: credentials.email,
      avatar: '👤',
      role,
    });
    handleUserUpdate(newUser);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cyber-gladiator-user');
  };

  const updateAvatar = async (avatar: string) => {
    if (user) {
      const updatedUser = updateUser(user.id, { avatar });
      if (updatedUser) {
        handleUserUpdate(updatedUser);
      }
    }
  };
  
  const addXp = async (amount: number) => {
    if (user) {
        const updatedUser = updateUser(user.id, { xp: user.xp + amount });
        if(updatedUser) {
            handleUserUpdate(updatedUser);
        }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateAvatar,
        addXp
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
