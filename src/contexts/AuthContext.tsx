
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
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
          return {
            id: existing.id,
            name: (data.name as string) || 'Gladiator',
            email: (data.email as string) || '',
            avatar: (data.avatar as string) || getRandomAvatar(),
            role,
          } as User;
        }
        const displayName = defaults?.name || auth.currentUser?.displayName || 'Gladiator';
        const email = defaults?.email || auth.currentUser?.email || '';
        const photoURL = defaults?.photoURL || auth.currentUser?.photoURL || undefined;
        const avatar = photoURL || getRandomAvatar();
        console.log('[Profile] Creating Firestore profile for', uid, { displayName, email, hasPhoto: !!photoURL });
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
    if (!firestore) return;
    if (lastFetchedUid.current === uid && user) return;
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

      setUser(profile);
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
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log('[Google] Redirect sign-in successful', result.user.email);
        }
      })
      .catch((error: unknown) => {
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
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      console.log('[Google] Attempting sign-in with popup');
      const result = await signInWithPopup(auth, provider);
      console.log('[Google] Popup sign-in successful', result.user.email);
      return;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err?.code === 'auth/popup-blocked') {
        console.log('[Google] Popup blocked, falling back to redirect');
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError: unknown) {
          const mapped = mapFirebaseAuthError(redirectError, 'google');
          if (!mapped.isSilent) {
            toast({ variant: "destructive", title: mapped.title, description: mapped.message });
          }
          console.error('[Google] Redirect fallback also failed', redirectError);
          return;
        }
      }
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        console.log('[Google] User cancelled popup');
        return;
      }
      console.error('[Google] signInWithPopup error', err?.code, error);
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
