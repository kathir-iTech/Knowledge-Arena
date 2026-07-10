
"use client";

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { useFirebase, useUser as useFirebaseUserHook } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signup: (credentials: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateAvatar: (avatar: string) => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, firestore } = useFirebase();
  const { user: firebaseUser, isUserLoading } = useFirebaseUserHook();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const signupInProgress = useRef(false);
  const signupUserId = useRef<string | null>(null);

  const getRandomAvatar = useCallback(() => {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }, []);

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) return;
    try {
        const userRef = doc(firestore, 'users', uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const data = userDoc.data() as Partial<User>;
            const role = data?.role;
            if (!role || (role !== 'teacher' && role !== 'student')) {
                console.error(`Invalid or missing role for uid: ${uid}. Role was: ${role}`);
                if (auth) signOut(auth);
                setUser(null);
                toast({
                    variant: "destructive",
                    title: "Account Error",
                    description: "Your account has an invalid role. Please contact support.",
                });
                return;
            }
            setUser({ id: userDoc.id, ...userDoc.data() } as User);
        } else {
            console.warn(`User document not found for uid: ${uid}. This may happen if creation is pending.`);
            if (auth) signOut(auth); 
            setUser(null);
        }
    } catch (error) {
        console.error("Error fetching user document:", error);
        setUser(null);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, auth, toast]);

  useEffect(() => {
    if (isUserLoading) {
      setIsLoading(true);
      return;
    }
    if (firebaseUser) {
      if (signupInProgress.current && signupUserId.current === firebaseUser.uid) {
        return;
      }
      fetchUserDocument(firebaseUser.uid);
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, [firebaseUser, isUserLoading, fetchUserDocument]);

  const login = async (credentials: { email: string, password?: string }) => {
    if (!auth) throw new Error("Auth service not available");
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
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Invalid email or password.",
      });
      throw error;
    }
  };

  const signup = async (credentials: { name: string; email: string; password?: string }) => {
    if (!auth || !firestore) throw new Error("Firebase services not available");
    if (!credentials.password) {
        toast({ variant: "destructive", title: "Signup Failed", description: "Password is required." });
        throw new Error("Password is required.");
    }

    // Teacher role is determined by email domain. Set NEXT_PUBLIC_TEACHER_DOMAIN env var
    // to configure (default: @staffs.com). The check is case-insensitive.
    const teacherDomain = (process.env.NEXT_PUBLIC_TEACHER_DOMAIN || '@staffs.com').toLowerCase();
    const normalizedEmail = credentials.email.toLowerCase();
    const role = normalizedEmail.endsWith(teacherDomain) ? 'teacher' : 'student';

    try {
      setIsLoading(true);
      signupInProgress.current = true;
      const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
      signupUserId.current = userCredential.user.uid;
      
      const newUser: Omit<User, 'id'> = {
        name: credentials.name,
        email: credentials.email,
        avatar: getRandomAvatar(),
        role,
      };
      
      const userRef = doc(firestore, "users", userCredential.user.uid);
      
      await setDoc(userRef, newUser).catch(error => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'create',
          requestResourceData: newUser,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw error;
      });
      
      setUser({ ...newUser, id: userCredential.user.uid });
      signupInProgress.current = false;
      signupUserId.current = null;
      
    } catch (error: unknown) {
       signupInProgress.current = false;
       signupUserId.current = null;
       const authError = error as { code?: string };
       if (authError.code === 'auth/email-already-in-use') {
         toast({ variant: "destructive", title: "Signup Failed", description: "An account with this email already exists." });
       } else {
         toast({ variant: "destructive", title: "Signup Failed", description: "An unexpected error occurred." });
       }
      throw error;
    } finally {
        setIsLoading(false);
    }
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    setUser(null);
  };

  const updateAvatar = async (avatar: string) => {
    if (user && firestore) {
      const userRef = doc(firestore, 'users', user.id);
      await updateDoc(userRef, { avatar }).catch(error => {
        const permissionError = new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: { avatar },
        });
        errorEmitter.emit('permission-error', permissionError);
        throw error;
      });
      setUser(prevUser => prevUser ? { ...prevUser, avatar } : null);
    }
  };

  const updateProfile = async (data: { name?: string; avatar?: string }) => {
    if (user && firestore) {
      const userRef = doc(firestore, 'users', user.id);
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.avatar !== undefined) updateData.avatar = data.avatar;
      await updateDoc(userRef, updateData);
      setUser(prev => prev ? { ...prev, ...data } : null);
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
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
