
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, runTransaction, getDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { useFirebase, useUser as useFirebaseUserHook } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { mapFirebaseAuthError } from '@/lib/firebase-auth-errors';
import { mapStaffIdToEmail } from '@/lib/staff-login';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
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
  const redirectCheckComplete = useRef(false);
  const fetchInProgress = useRef(false);
  const fetchInProgressUid = useRef<string | null>(null);
  const loginGuard = useRef(false);

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

  const buildFallbackProfile = useCallback((uid: string, defaults?: { name?: string; email?: string; photoURL?: string }): User => ({
    id: uid,
    name: defaults?.name || auth?.currentUser?.displayName || 'Gladiator',
    email: defaults?.email || auth?.currentUser?.email || '',
    avatar: defaults?.photoURL || auth?.currentUser?.photoURL || getRandomAvatar(),
    role: 'gladiator' as const,
  }), [auth, getRandomAvatar]);

  const ensureGladiatorProfile = useCallback(async (uid: string, defaults?: { name?: string; email?: string; photoURL?: string }): Promise<User> => {
    if (!firestore || !auth) return buildFallbackProfile(uid, defaults);
    const userRef = doc(firestore, 'users', uid);
    try {
      const result = await runTransaction(firestore, async (transaction) => {
        const existing = await transaction.get(userRef);
        if (existing.exists()) {
          const data = existing.data() as Record<string, unknown>;
          const role = normalizeRole(data.role as string | undefined);
          if (!role) {
            console.warn('[Profile] Invalid role for user', uid, data.role);
            return buildFallbackProfile(uid, defaults);
          }
          const storedAvatar = (data.avatar as string) || '';
          const googlePhotoURL = defaults?.photoURL || auth.currentUser?.photoURL || undefined;
          let finalAvatar = storedAvatar;
          if (storedAvatar.startsWith('http') && googlePhotoURL && googlePhotoURL !== storedAvatar) {
            finalAvatar = googlePhotoURL;
            transaction.update(userRef, { avatar: finalAvatar });
          }
          return {
            id: existing.id,
            name: (data.name as string) || 'Gladiator',
            email: (data.email as string) || '',
            avatar: finalAvatar || getRandomAvatar(),
            role,
            mustChangePassword: data.mustChangePassword === true,
          } as User;
        }
        const displayName = defaults?.name || auth.currentUser?.displayName || 'Gladiator';
        const email = defaults?.email || auth.currentUser?.email || '';
        const photoURL = defaults?.photoURL || auth.currentUser?.photoURL || undefined;
        const avatar = photoURL || getRandomAvatar();

        const newUser: User = {
          id: uid,
          name: displayName,
          email,
          avatar,
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
    } catch (err) {
      console.error('[Profile] Firestore profile creation failed for', uid, '- using local fallback', err);
      return buildFallbackProfile(uid, defaults);
    }
  }, [firestore, auth, getRandomAvatar, normalizeRole, buildFallbackProfile]);

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) { setIsLoading(false); return; }
    if (lastFetchedUid.current === uid && user) return;
    if (fetchInProgress.current && fetchInProgressUid.current === uid) return;
    fetchInProgress.current = true;
    fetchInProgressUid.current = uid;
    lastFetchedUid.current = uid;
    try {
        const googleUser = auth?.currentUser;
        const profile = await ensureGladiatorProfile(uid, {
          name: googleUser?.displayName || undefined,
          email: googleUser?.email || undefined,
          photoURL: googleUser?.photoURL || undefined,
        });
        setUser(profile);
    } catch (err) {
        console.error('AuthContext: fetchUserDocument error', err);
        const googleUser = auth?.currentUser;
        setUser(buildFallbackProfile(uid, {
          name: googleUser?.displayName || undefined,
          email: googleUser?.email || undefined,
          photoURL: googleUser?.photoURL || undefined,
        }));
    } finally {
        setIsLoading(false);
        fetchInProgress.current = false;
        fetchInProgressUid.current = null;
    }
  }, [firestore, auth, user, ensureGladiatorProfile, buildFallbackProfile]);

  useEffect(() => {
    if (isUserLoading) {
      setIsLoading(true);
      return;
    }
    if (firebaseUser) {
      if (signupInProgress.current && signupUserId.current === firebaseUser.uid) {
        return;
      }
      if (loginGuard.current) {
        return;
      }
      sessionStorage.removeItem('oa_pending');
      fetchUserDocument(firebaseUser.uid);
    } else {
      setUser(null);
      fetchInProgress.current = false;
      fetchInProgressUid.current = null;
      sessionStorage.removeItem('oa_pending');
      if (redirectCheckComplete.current) {
        setIsLoading(false);
      }
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
      const email = mapStaffIdToEmail(credentials.email);
      await checkRateLimit('login', email);
      await signInWithEmailAndPassword(auth, email, credentials.password);

      loginGuard.current = true;

      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          await signOut(auth);
          loginGuard.current = false;
          toast({ variant: "destructive", title: "Sign In Failed", description: "Unable to verify account." });
          throw new Error("Unable to verify account.");
        }

        if (!firestore) {
          await signOut(auth);
          loginGuard.current = false;
          toast({ variant: "destructive", title: "Sign In Failed", description: "Service not available." });
          throw new Error("Service not available.");
        }

        const userDoc = await getDoc(doc(firestore, 'users', uid));

        if (!userDoc.exists()) {
          await signOut(auth);
          loginGuard.current = false;
          toast({ variant: "destructive", title: "Access Denied", description: "Staff account not found. Contact your Executive." });
          throw new Error("Staff account not found.");
        }

        const role = userDoc.data()?.role;
        if (!role || !['executive', 'commander'].includes(role)) {
          await signOut(auth);
          loginGuard.current = false;
          toast({ variant: "destructive", title: "Access Denied", description: "Staff login is not available for this account. Gladiators must use Google Sign-In." });
          throw new Error("Staff login is not available for this account.");
        }
      } finally {
        loginGuard.current = false;
      }
    } catch (error: unknown) {
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Too Many Attempts", description: "Too many attempts. Please wait a moment and try again." });
        throw error;
      }
      if (error instanceof Error && (
        error.message.includes('Access Denied') ||
        error.message.includes('Staff account not found') ||
        error.message.includes('Staff login is not available')
      )) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('Unable to verify')) {
        throw error;
      }
      const mapped = mapFirebaseAuthError(error, 'login');
      toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      throw new Error(mapped.message);
    }
  };

  useEffect(() => {
    if (!auth) { redirectCheckComplete.current = true; return; }
    redirectCheckComplete.current = false;
    getRedirectResult(auth)
      .then((result) => {
        redirectCheckComplete.current = true;
        if (result) {
          sessionStorage.removeItem('oa_pending');
        } else {
          const oaMarker = sessionStorage.getItem('oa_pending');
          let oaValid = false;
          if (oaMarker) {
            const ts = parseInt(oaMarker, 10);
            if (!isNaN(ts) && Date.now() - ts < 180000) oaValid = true;
            else sessionStorage.removeItem('oa_pending');
          }
          if (!oaValid && !auth?.currentUser) {
            setIsLoading(false);
          }
        }
      })
      .catch((error: unknown) => {
        redirectCheckComplete.current = true;
        console.error('[Auth] getRedirectResult ERROR:', error);
        setIsLoading(false);
        sessionStorage.removeItem('oa_pending');
        const mapped = mapFirebaseAuthError(error, 'google');
        if (!mapped.isSilent) {
          toast({ variant: "destructive", title: mapped.title, description: mapped.message });
        }
      });
  }, [auth, toast]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      toast({ variant: "destructive", title: "Google Sign-In Failed", description: "Auth service not available." });
      return;
    }
    setIsLoading(true);
    sessionStorage.setItem('oa_pending', Date.now().toString());
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithRedirect(auth, provider);
    } catch (error: unknown) {
      console.error('[Auth] signInWithRedirect error', error);
      sessionStorage.removeItem('oa_pending');
      setIsLoading(false);
      const mapped = mapFirebaseAuthError(error, 'google');
      if (!mapped.isSilent) {
        toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      }
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
