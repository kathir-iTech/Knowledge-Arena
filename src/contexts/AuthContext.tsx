
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
  login: (credentials: { email: string, password: string }) => Promise<void>;
  signup: (credentials: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatar: string) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, firestore, user: firebaseUser, isUserLoading } = useFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) return;
    try {
        const userRef = doc(firestore, 'users', uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            setUser(userDoc.data() as User);
        } else {
            // This case can happen if the user exists in Auth but not Firestore
            // You might want to log them out or create the document here.
            setUser(null);
        }
    } catch (error) {
        console.error("Error fetching user document:", error);
        setUser(null);
    } finally {
        setIsLoading(false);
    }
  }, [firestore]);


  useEffect(() => {
    if (isUserLoading) {
      setIsLoading(true);
      return;
    }
    if (firebaseUser) {
      fetchUserDocument(firebaseUser.uid);
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, [firebaseUser, isUserLoading, fetchUserDocument]);


  const login = async (credentials: { email: string, password?: string }) => {
    if (!credentials.password) {
        toast({
            variant: "destructive",
            title: "Login Failed",
            description: "Password is required.",
        });
        throw new Error("Password is required.");
    }
    try {
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      // Auth state change will trigger useEffect to fetch user doc
    } catch (error: any) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          toast({
          variant: "destructive",
          title: "Login Failed",
          description: "Invalid email or password.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Login Error",
          description: error.message || "An unexpected error occurred during login.",
        });
      }
      throw error;
    }
  };

  const signup = async (credentials: { name: string; email: string; password?: string }) => {
    if (!credentials.password) {
        toast({
            variant: "destructive",
            title: "Signup Failed",
            description: "Password is required.",
        });
        throw new Error("Password is required.");
    }

    try {
      setIsLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
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
      
      // Don't call setUser here, let the onAuthStateChanged listener handle it
      // to ensure a single source of truth for the user state.
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
            description: error.message || "An unexpected error occurred during signup.",
         });
       }
      throw error;
    } finally {
        // Don't set loading to false here; let the auth listener do it
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
      console.error("Password reset error:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading: isLoading,
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
