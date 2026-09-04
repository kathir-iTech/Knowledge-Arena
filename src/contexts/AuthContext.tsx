"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, runTransaction, getDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { useFirebase, useUser as useFirebaseUserHook } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { mapFirebaseAuthError } from '@/lib/firebase-auth-errors';
import { mapStaffIdToEmail } from '@/lib/staff-login';
import { getDemoAccount } from '@/lib/demo-accounts';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateAvatar: (avatar: string) => Promise<void>;
  updateProfile: (data: { name?: string; avatar?: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Part 5A: Gladiator signup is OPEN — any Google account may create a
// gladiator profile. Domain restriction is now per-arena at join time
// (arena.allowed_gladiator_domain snapshot of Commander institution_domain).
// The old global ALLOWED_GLADIATOR_DOMAIN env var is no longer used for
// signup enforcement; it remains only for reference / legacy.
const IS_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

const PROFILE_TIMEOUT_MS = 10000;
const AUTH_OP_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); }
    );
  });
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isPermissionDenied(err: unknown): boolean {
  const msg = getErrorMessage(err);
  const code = (err as { code?: string })?.code || '';
  return code === 'permission-denied'
    || code === 'PERMISSION_DENIED'
    || msg.includes('Missing or insufficient permissions')
    || msg.includes('PERMISSION_DENIED')
    || msg.includes('permission-denied')
    || msg.toLowerCase().includes('insufficient permissions');
}

function isTimeoutError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes('timed out');
}

const EMOJIS = [
  '🤖', '👾', '🔮', '🧠', '👻', '🧑‍🚀', '🧛', '🧟', '🧞', '🦹', '🦸',
  '🧙', '🧚', '🧑‍💻', '👨‍🎤', '🕵️', '💂', '👨‍🎨', '👨‍🔬', '👨‍🔧', '👨‍⚖️', '👨‍🚀', '👨‍🚒'
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, firestore } = useFirebase();
  const { user: firebaseUser, isUserLoading } = useFirebaseUserHook();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const signupInProgress = useRef(false);
  const signupUserId = useRef<string | null>(null);
  const lastFetchedUid = useRef<string | null>(null);
  const fetchInProgress = useRef(false);
  const fetchInProgressUid = useRef<string | null>(null);

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
      const result = await withTimeout(
        runTransaction(firestore, async (transaction) => {
          const existing = await transaction.get(userRef);
          if (existing.exists()) {
            const data = existing.data() as Record<string, unknown>;
            const role = normalizeRole(data.role as string | undefined);
            if (!role) {
              console.warn('[Profile] Invalid role for user', uid, data.role);
              throw new Error('Account not recognized — contact your Executive');
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
        }),
        PROFILE_TIMEOUT_MS,
        'Profile creation'
      );
      return result;
    } catch (err) {
      const msg = getErrorMessage(err);
      const permissionDenied = isPermissionDenied(err);
      const timeout = isTimeoutError(err);
      const unknownRole = msg.includes('Account not recognized');
      if (unknownRole) {
        if (auth) { void signOut(auth).catch(() => {}); }
        setUser(null);
        setIsLoading(false);
        setAuthError('Account not recognized — contact your Executive');
        toast({
          variant: 'destructive',
          title: 'Account Error',
          description: 'Account not recognized — contact your Executive',
        });
        throw err;
      }
      if (permissionDenied) {
        console.error('[Profile] Firestore permission denied for', uid, err);
        if (auth) { void signOut(auth).catch(() => {}); }
        setUser(null);
        setIsLoading(false);
        const friendly = 'Sign-in failed — please try again';
        setAuthError(friendly);
        toast({ variant: "destructive", title: "Sign-in failed", description: friendly });
        throw err;
      }
      if (timeout) {
        console.error('[Profile] Firestore operation timed out for', uid, err);
        if (auth) { void signOut(auth).catch(() => {}); }
        setUser(null);
        setIsLoading(false);
        const friendly = 'Sign-in failed — please try again';
        setAuthError(friendly);
        toast({ variant: "destructive", title: "Sign-in failed", description: "Request timed out. Please try again." });
        throw err;
      }
      // Any other error during Gladiator profile creation must sign out — do not leave half-authenticated
      console.error('[Profile] Firestore profile creation failed for', uid, err);
      if (auth) { void signOut(auth).catch(() => {}); }
      setUser(null);
      setIsLoading(false);
      const friendly = 'Sign-in failed — please try again';
      setAuthError(friendly);
      toast({ variant: "destructive", title: "Sign-in failed", description: friendly });
      throw err;
    }
  }, [firestore, auth, getRandomAvatar, normalizeRole, buildFallbackProfile, toast]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // 10-second timeout: if profile resolution doesn't complete after onAuthStateChanged
  // fires with a user, break the infinite "Authenticating..." spinner and surface
  // a visible error with reload action. This guards against hung Firestore
  // transactions/gets (e.g. permission-denied that was previously swallowed).
  useEffect(() => {
    if (!isLoading || !firebaseUser) {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }
      return;
    }
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    authTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.error('[Auth] Profile resolution timed out after 10s for', firebaseUser.uid);
        setAuthError("Sign-in failed — please try again");
        setIsLoading(false);
        setUser(null);
        toast({ variant: "destructive", title: "Sign-in failed", description: "Request timed out. Please try again." });
        if (auth) { void signOut(auth).catch(() => {}); }
      }
    }, PROFILE_TIMEOUT_MS);
    return () => {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }
    };
  }, [isLoading, firebaseUser, auth, toast]);

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) { setIsLoading(false); return; }
    if (lastFetchedUid.current === uid && user) { return; }
    if (fetchInProgress.current && fetchInProgressUid.current === uid) { return; }
    fetchInProgress.current = true;
    fetchInProgressUid.current = uid;
    lastFetchedUid.current = uid;
    // Clear any prior auth error when starting a fresh profile fetch
    setAuthError(null);
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    try {
        const googleUser = auth?.currentUser;
        const profile = await ensureGladiatorProfile(uid, {
          name: googleUser?.displayName || undefined,
          email: googleUser?.email || undefined,
          photoURL: googleUser?.photoURL || undefined,
        });
        // Post-fetch unknown role guard: ensure role is valid, otherwise sign out
        if (!profile.role || !['executive', 'commander', 'gladiator'].includes(profile.role)) {
          throw new Error('Account not recognized — contact your Executive');
        }
        setUser(profile);
        setAuthError(null);
    } catch (err) {
        const msg = getErrorMessage(err);
        const permissionDenied = isPermissionDenied(err);
        const timeout = isTimeoutError(err);
        const unknownRole = msg.includes('Account not recognized');
        // Permission, timeout and unknown-role errors already surfaced with authError + toast in
        // ensureGladiatorProfile; don't silently fall back.
        if (permissionDenied || timeout || unknownRole) {
          console.error('AuthContext: fetchUserDocument permission/domain/timeout/role error', err);
          // authError and isLoading already set by ensureGladiatorProfile; ensure we don't overwrite
          // But ensure loading is false if not already
          setIsLoading(false);
          return;
        }
        // Any other error: ensureGladiatorProfile already signed out and set error; just ensure loading false
        console.error('AuthContext: fetchUserDocument error', err);
        setIsLoading(false);
        // Do not create fallback — leave signed out
        return;
    } finally {
        // Only clear loading if not already cleared by timeout/error path
        // (timeout already sets isLoading false; this is idempotent)
        setIsLoading(false);
        fetchInProgress.current = false;
        fetchInProgressUid.current = null;
        if (authTimeoutRef.current) {
          clearTimeout(authTimeoutRef.current);
          authTimeoutRef.current = null;
        }
    }
  }, [firestore, auth, user, ensureGladiatorProfile]);

  useEffect(() => {
    if (isUserLoading) {
      setIsLoading(true);
      return;
    }
    if (firebaseUser) {
      if (signupInProgress.current && signupUserId.current === firebaseUser.uid) {
        // Ensure we don't hang forever if signup stalls
        // No-op: global timeout will clear loading if profile never resolves
        return;
      }
      // Part 5A: signup is open — no domain gate at sign-in. Domain is enforced
      // at arena-join time via allowed_gladiator_domain.
      fetchUserDocument(firebaseUser.uid);
    } else {
      setUser(null);
      fetchInProgress.current = false;
      fetchInProgressUid.current = null;
      setIsLoading(false);
    }
  }, [firebaseUser, isUserLoading, fetchUserDocument, firestore, auth, toast]);

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
    setAuthError(null);
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
      await withTimeout(checkRateLimit('login', email), AUTH_OP_TIMEOUT_MS, 'Rate limit check');
      await withTimeout(signInWithEmailAndPassword(auth, email, credentials.password), AUTH_OP_TIMEOUT_MS, 'Sign in');

      const uid = auth.currentUser?.uid;
      if (!uid) {
        await signOut(auth);
        toast({ variant: "destructive", title: "Sign In Failed", description: "Unable to verify account." });
        throw new Error("Unable to verify account.");
      }

      if (!firestore) {
        await signOut(auth);
        toast({ variant: "destructive", title: "Sign In Failed", description: "Service not available." });
        throw new Error("Service not available.");
      }

      let userDoc;
      try {
        userDoc = await withTimeout(getDoc(doc(firestore, 'users', uid)), PROFILE_TIMEOUT_MS, 'Profile read');
      } catch (e) {
        if (isPermissionDenied(e)) {
          await signOut(auth);
          setAuthError("Sign-in failed — please try again");
          toast({ variant: "destructive", title: "Sign In Failed", description: "Please try again" });
          throw new Error("Sign-in failed — please try again");
        }
        if (isTimeoutError(e)) {
          await signOut(auth);
          setAuthError("Sign-in failed — please try again");
          toast({ variant: "destructive", title: "Sign In Failed", description: "Request timed out. Please try again." });
          throw new Error("Request timed out. Please try again.");
        }
        throw e;
      }

      if (!userDoc.exists()) {
        await signOut(auth);
        setAuthError("Account not recognized — contact your Executive");
        toast({ variant: "destructive", title: "Access Denied", description: "Staff account not found. Contact your Executive." });
        throw new Error("Staff account not found.");
      }

      const role = userDoc.data()?.role;
      const normalized = normalizeRole(role);
      if (!normalized || !['executive', 'commander'].includes(normalized)) {
        const isDemoGladiator =
          normalized === 'gladiator' &&
          process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true' &&
          email === getDemoAccount('gladiator')?.email;
        if (!isDemoGladiator) {
          // Unknown or gladiator trying staff login
          if (!normalized) {
            await signOut(auth);
            setAuthError("Account not recognized — contact your Executive");
            toast({ variant: "destructive", title: "Access Denied", description: "Account not recognized — contact your Executive" });
            throw new Error("Account not recognized — contact your Executive");
          }
          await signOut(auth);
          toast({ variant: "destructive", title: "Access Denied", description: "Staff login is not available for this account. Gladiators must use Google Sign-In." });
          throw new Error("Staff login is not available for this account.");
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Too Many Attempts", description: "Too many attempts. Please wait a moment and try again." });
        // Ensure loading is not stuck
        setIsLoading(false);
        throw error;
      }
      if (error instanceof Error && (
        error.message.includes('Access Denied') ||
        error.message.includes('Staff account not found') ||
        error.message.includes('Staff login is not available') ||
        error.message.includes('Account not recognized') ||
        error.message.includes('Sign-in failed') ||
        error.message.includes('Request timed out')
      )) {
        // Already handled with toast/authError above
        setIsLoading(false);
        throw error;
      }
      if (error instanceof Error && error.message.includes('Unable to verify')) {
        setIsLoading(false);
        throw error;
      }
      if (isPermissionDenied(error)) {
        setAuthError("Sign-in failed — please try again");
        setIsLoading(false);
        toast({ variant: "destructive", title: "Sign In Failed", description: "Please try again" });
        throw new Error("Sign-in failed — please try again");
      }
      if (isTimeoutError(error)) {
        setAuthError("Sign-in failed — please try again");
        setIsLoading(false);
        toast({ variant: "destructive", title: "Sign In Failed", description: "Request timed out. Please try again." });
        throw new Error("Request timed out. Please try again.");
      }
      const mapped = mapFirebaseAuthError(error, 'login');
      toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      setIsLoading(false);
      throw new Error(mapped.message);
    }
  };

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      toast({ variant: "destructive", title: "Google Sign-In Failed", description: "Auth service not available." });
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
    });
    try {
      await withTimeout(signInWithPopup(auth, provider), 120000, 'Google redirect');
      // onAuthStateChanged will fire and fetchUserDocument will handle profile creation.
      // Part 5A: domain is enforced at arena-join, not at Google sign-in.
    } catch (error: unknown) {
      console.error('[Auth] signInWithPopup error', error);
      setIsLoading(false);
      const code = (error as { code?: string })?.code || '';
      const msg = getErrorMessage(error).toLowerCase();
      if (code === 'auth/popup-blocked' || msg.includes('popup was blocked') || msg.includes('popup_blocked')) {
        const friendly = 'Popup was blocked. Please allow popups for this site and try again.';
        setAuthError(friendly);
        toast({ variant: "destructive", title: "Popup Blocked", description: friendly });
        return;
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed popup — silently reset loading, no error toast
        return;
      }
      if (isTimeoutError(error)) {
        setAuthError("Sign-in failed — please try again");
        toast({ variant: "destructive", title: "Google Sign-In Failed", description: "Request timed out. Please try again." });
        return;
      }
      if (isPermissionDenied(error)) {
        setAuthError("Sign-in failed — please try again");
        toast({ variant: "destructive", title: "Sign-in failed", description: "Please try again" });
        return;
      }
      const mapped = mapFirebaseAuthError(error, 'google');
      if (!mapped.isSilent) {
        setAuthError(mapped.message);
        toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      }
    }
  }, [auth, toast]);

  const logout = async () => {
    if (!auth) return;
    setAuthError(null);
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    try {
      await signOut(auth);
    } catch {
      // ensure cleanup runs even if signOut fails
    }
    setUser(null);
    setIsLoading(false);
    lastFetchedUid.current = null;
    fetchInProgress.current = false;
    fetchInProgressUid.current = null;
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

  const refreshUser = useCallback(async () => {
    const uid = auth?.currentUser?.uid;
    if (!uid || !firestore) return;
    lastFetchedUid.current = null;
    fetchInProgress.current = false;
    fetchInProgressUid.current = null;
    await fetchUserDocument(uid);
  }, [auth, firestore, fetchUserDocument]);

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    authError,
    clearAuthError,
    login,
    signInWithGoogle,
    logout,
    updateAvatar,
    updateProfile,
    refreshUser,
  }), [user, isLoading, authError, clearAuthError, signInWithGoogle, refreshUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
