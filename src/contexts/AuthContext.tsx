
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';
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
  const lastFetchedUid = useRef<string | null>(null);

  const getRandomAvatar = useCallback(() => {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }, []);

  const normalizeRole = useCallback((raw: string | undefined): 'executive' | 'commander' | 'gladiator' => {
    if (raw === 'teacher') return 'commander';
    if (raw === 'student') return 'gladiator';
    if (raw === 'executive' || raw === 'commander' || raw === 'gladiator') return raw;
    console.warn('AuthContext: unknown role in Firestore user document', raw);
    return 'gladiator';
  }, []);

  const ensureGladiatorProfile = useCallback(async (uid: string, defaults?: { name?: string; email?: string }): Promise<User | null> => {
    if (!firestore || !auth) return null;
    const userRef = doc(firestore, 'users', uid);
    try {
      const result = await runTransaction(firestore, async (transaction) => {
        const existing = await transaction.get(userRef);
        if (existing.exists()) {
          const data = existing.data() as Record<string, unknown>;
          return {
            id: existing.id,
            name: (data.name as string) || 'Gladiator',
            email: (data.email as string) || '',
            avatar: (data.avatar as string) || getRandomAvatar(),
            role: normalizeRole(data.role as string | undefined),
          } as User;
        }
        const newUser: User = {
          id: uid,
          name: defaults?.name || auth.currentUser?.displayName || 'Gladiator',
          email: defaults?.email || auth.currentUser?.email || '',
          avatar: getRandomAvatar(),
          role: 'gladiator',
        };
        transaction.set(userRef, {
          name: newUser.name,
          email: newUser.email,
          avatar: newUser.avatar,
          role: 'gladiator',
        });
        return newUser;
      });
      return result;
    } catch {
      return null;
    }
  }, [firestore, auth, getRandomAvatar, normalizeRole]);

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) return;
    if (lastFetchedUid.current === uid && user) return;
    lastFetchedUid.current = uid;
    try {
        const profile = await ensureGladiatorProfile(uid);
        setUser(profile);
    } catch (err) {
        console.error('AuthContext: fetchUserDocument error', err);
        setUser(null);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, ensureGladiatorProfile]);

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

  const checkRateLimit = async (type: 'login' | 'signup', identifier?: string) => {
    try {
      const res = await fetch('/api/rate-limit/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier }),
      });
      if (res.status === 429) {
        const data = await res.json();
        throw new Error(data.error || 'Too many attempts. Please wait.');
      }
      if (!res.ok) throw new Error('Rate limit check failed');
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('Rate limit check failed');
    }
  };

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
      await checkRateLimit('login', credentials.email);
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
    } catch (error: unknown) {
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Rate Limited", description: error.message });
        throw error;
      }
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

    try {
      await checkRateLimit('signup');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rate limit exceeded.';
      toast({ variant: "destructive", title: "Rate Limited", description: msg });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      signupInProgress.current = true;
      const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
      const uid = userCredential.user.uid;
      signupUserId.current = uid;

      const profile = await ensureGladiatorProfile(uid, {
        name: credentials.name,
        email: credentials.email,
      });

      if (profile) {
        setUser(profile);
      } else {
        throw Object.assign(new Error('Failed to create profile'), { code: 'unavailable' });
      }
      signupInProgress.current = false;
      signupUserId.current = null;

    } catch (error: unknown) {
       signupInProgress.current = false;
       signupUserId.current = null;
       const err = error as { code?: string; message?: string };
       let description: string;
       switch (err.code) {
         case 'auth/email-already-in-use':
           description = 'This email is already registered. Please sign in instead.';
           break;
         case 'auth/operation-not-allowed':
           description = 'Account creation is currently unavailable.';
           break;
         case 'auth/network-request-failed':
           description = 'Network error. Please check your connection.';
           break;
         case 'auth/too-many-requests':
           description = 'Too many attempts. Please wait.';
           break;
         case 'auth/weak-password':
           description = 'Password is too weak.';
           break;
         case 'auth/invalid-email':
           description = 'Invalid email address.';
           break;
         case 'auth/user-not-found':
           description = 'No account found with this email.';
           break;
         case 'auth/wrong-password':
           description = 'Incorrect password.';
           break;
         case 'permission-denied':
           description = 'Account creation is currently unavailable. Please try again.';
           break;
         case 'unavailable':
           description = 'Account creation is currently unavailable. Please try again.';
           break;
         case 'failed-precondition':
           description = 'Account creation is currently unavailable. Please try again.';
           break;
         default:
           description = 'An unexpected error occurred. Please try again.';
       }
       toast({ variant: "destructive", title: "Signup Failed", description });
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

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    signup,
    logout,
    updateAvatar,
    updateProfile,
  }), [user, isLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
