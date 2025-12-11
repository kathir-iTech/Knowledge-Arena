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
} from 'firebase/auth';
import { useFirebase } from '@/firebase';

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


  const login = async (credentials: { email: string }) => {
    // NOTE: This app uses email as a username, not for a real email/password flow
    // For simplicity, we use a fixed password.
    try {
      await signInWithEmailAndPassword(auth, credentials.email, 'password');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "No account found with that email. Please sign up.",
      });
      throw new Error("User not found");
    }
  };

  const signup = async (credentials: { name: string; email: string }) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, 'password');
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
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Signup Failed",
        description: "An account with this email already exists or another error occurred.",
      });
      throw new Error("User already exists or another error occurred");
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
        addXp
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
