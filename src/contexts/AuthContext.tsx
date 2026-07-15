
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { useFirebase, useUser as useFirebaseUserHook } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { mapFirebaseAuthError } from '@/lib/firebase-auth-errors';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signup: (credentials: { name: string; email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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
  const invalidProfileUids = useRef<Set<string>>(new Set());

  const getRandomAvatar = useCallback(() => {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }, []);

  const normalizeRole = useCallback((raw: string | undefined): 'executive' | 'commander' | 'gladiator' | null => {
    if (raw === 'teacher') return 'commander';
    if (raw === 'student') return 'gladiator';
    if (raw === 'executive' || raw === 'commander' || raw === 'gladiator') return raw;
    console.warn('AuthContext: invalid role in Firestore user document', raw);
    return null;
  }, []);

  const ensureGladiatorProfile = useCallback(async (uid: string, defaults?: { name?: string; email?: string }): Promise<User | null> => {
    if (!firestore || !auth) return null;
    const userRef = doc(firestore, 'users', uid);
    try {
      const result = await runTransaction(firestore, async (transaction) => {
        const existing = await transaction.get(userRef);
        if (existing.exists()) {
          const data = existing.data() as Record<string, unknown>;
          const role = normalizeRole(data.role as string | undefined);
          if (!role) {
            return null;
          }
          return {
            id: existing.id,
            name: (data.name as string) || 'Gladiator',
            email: (data.email as string) || '',
            avatar: (data.avatar as string) || getRandomAvatar(),
            role,
          } as User;
        }
        const googlePhoto = auth.currentUser?.photoURL;
        const newUser: User = {
          id: uid,
          name: defaults?.name || auth.currentUser?.displayName || 'Gladiator',
          email: defaults?.email || auth.currentUser?.email || '',
          avatar: googlePhoto || getRandomAvatar(),
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
    if (invalidProfileUids.current.has(uid)) return;
    lastFetchedUid.current = uid;
    try {
        const profile = await ensureGladiatorProfile(uid);
        if (!profile) {
          invalidProfileUids.current.add(uid);
          console.warn('AuthContext: invalid profile for uid', uid);
          toast({
            variant: "destructive",
            title: "Account Configuration Error",
            description: "Your account has an invalid configuration. Please contact support.",
          });
        }
        setUser(profile);
    } catch (err) {
        console.error('AuthContext: fetchUserDocument error', err);
        setUser(null);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, ensureGladiatorProfile, toast]);

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
            title: "Sign In Failed",
            description: "Password is required.",
        });
        throw new Error("Password is required.");
    }
    try {
      await checkRateLimit('login', credentials.email);
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
    } catch (error: unknown) {
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Too Many Attempts", description: "Too many attempts. Please wait a moment and try again." });
        throw error;
      }
      const mapped = mapFirebaseAuthError(error, 'login');
      toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      throw new Error(mapped.message);
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
      toast({ variant: "destructive", title: "Too Many Attempts", description: "Too many attempts. Please wait a moment and try again." });
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
       const mapped = mapFirebaseAuthError(error, 'signup');
       toast({ variant: "destructive", title: mapped.title, description: mapped.message });
       throw new Error(mapped.message);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((error: unknown) => {
      const mapped = mapFirebaseAuthError(error, 'google');
      if (!mapped.isSilent) {
        toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      }
    });
  }, [auth, toast]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error("Auth service not available");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithRedirect(auth, provider);
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error, 'google');
      if (!mapped.isSilent) {
        toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      }
      throw new Error(mapped.message);
    }
  }, [auth, toast]);

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
    signInWithGoogle,
    logout,
    updateAvatar,
    updateProfile,
  }), [user, isLoading, signInWithGoogle]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
