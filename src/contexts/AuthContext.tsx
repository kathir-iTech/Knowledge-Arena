"use client";

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { useFirebase } from '@/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string, password?: string }) => Promise<void>;
  signup: (credentials: { name: string; email: string; password?: string }) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatar: string) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, firestore, user: firebaseUser, isUserLoading } = useFirebase();
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isUserLoading) return;
    if (firebaseUser) {
      const userRef = doc(firestore, 'users', firebaseUser.uid);
      getDoc(userRef).then(userDoc => {
        if (userDoc.exists()) {
          setUser(userDoc.data() as User);
        } else {
          // Handle case where auth user exists but no firestore doc.
          // This can happen in signup.
        }
      });
    } else {
      setUser(null);
    }
  }, [firebaseUser, isUserLoading, firestore]);


  const login = async (credentials: { email: string, password?: string }) => {
    const password = credentials.password || 'password'; // fallback for old behavior
    try {
      await signInWithEmailAndPassword(auth, credentials.email, password);
    } catch (error: any) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          toast({
          variant: "destructive",
          title: "Login Failed",
          description: "Invalid email or password.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Login Error",
          description: "An unexpected error occurred during login.",
        });
      }
      throw error;
    }
  };

  const signup = async (credentials: { name: string; email: string; password?: string }) => {
    const password = credentials.password || 'password'; // fallback for old behavior
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, password);
      const role = credentials.email.endsWith('@staffs.com') ? 'Teacher' : 'Student';
      const newUser: User = {
        id: userCredential.user.uid,
        name: credentials.name,
        email: credentials.email,
        avatar: '👤',
        role,
        xp: 0
      };
      await setDoc(doc(firestore, "users", userCredential.user.uid), newUser);
      setUser(newUser);
    } catch (error: any) {
       if (error.code === 'auth/email-already-in-use') {
         toast({
            variant: "destructive",
            title: "Signup Failed",
            description: "An account with this email already exists.",
         });
       } else {
         toast({
            variant: "destructive",
            title: "Signup Failed",
            description: "An unexpected error occurred during signup.",
         });
       }
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const updateAvatar = async (avatar: string) => {
    if (user) {
      const userRef = doc(firestore, 'users', user.id);
      await updateDoc(userRef, { avatar });
      setUser(prevUser => prevUser ? { ...prevUser, avatar } : null);
    }
  };
  
  const addXp = async (amount: number) => {
    if (user) {
        const newXp = user.xp + amount;
        const userRef = doc(firestore, 'users', user.id);
        await updateDoc(userRef, { xp: newXp });
        setUser(prevUser => prevUser ? { ...prevUser, xp: newXp } : null);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      // Don't reveal if the user exists or not for security reasons.
      // The toast in the component handles the user-facing message.
      console.error("Password reset error:", error);
      // We can re-throw if we want the component to handle it, but for now we just log it.
      // The component will show a generic success message regardless.
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading: isUserLoading,
        login,
        signup,
        logout,
        updateAvatar,
        addXp,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
