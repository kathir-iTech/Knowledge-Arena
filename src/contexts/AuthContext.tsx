"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile as setFirebaseDisplayName,
} from 'firebase/auth';
import { useFirebase, useUser as useFirebaseUserHook } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { mapFirebaseAuthError } from '@/lib/firebase-auth-errors';
import { VALID_ROLES, type AppRole } from '@/lib/session-role';
import { mintSessionCookie } from '@/lib/client-session';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (data: { name: string; email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
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

const PROFILE_TIMEOUT_MS = 10000;
const AUTH_OP_TIMEOUT_MS = 10000;
// The rate-limit pre-check is a Firestore-backed transaction on the server; on
// a cold start (or a cold dev server) it legitimately exceeds AUTH_OP_TIMEOUT_MS.
// Failing the WHOLE sign-in because the limiter was slow is wrong — the limiter
// already fails open server-side — so it gets a longer, separate budget.
const RATE_LIMIT_TIMEOUT_MS = 30000;
// Phase A2: background session mint retries (bounded so a server-side
// misconfiguration surfaces as a visible error instead of an endless loop).
const MIGRATION_MAX_ATTEMPTS = 3;

// Debug-only auth tracing, gated behind ?debug=1. NEVER log tokens or email
// addresses — uid and error codes only.
function debugLog(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
  // eslint-disable-next-line no-console -- opt-in debug tracing (?debug=1)
  console.info('[Auth][debug]', ...args);
}

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
  // Login owns the profile fetch the same way signup does: while the session
  // mint is in flight, suppress the auth-state effect's fetchUserDocument so a
  // signOut-induced Firestore error cannot race it and overwrite the specific
  // server error (e.g. SERVICE_ACCOUNT_PROJECT_MISMATCH) with a generic one.
  const loginInProgress = useRef(false);
  const lastFetchedUid = useRef<string | null>(null);
  const fetchInProgress = useRef(false);
  const fetchInProgressUid = useRef<string | null>(null);
  const migrationDone = useRef(false);
  const migrationAttempts = useRef(0);

  const getRandomAvatar = useCallback(() => {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }, []);

  const normalizeRole = useCallback((raw: string | undefined): AppRole | null => {
    if (raw === 'teacher') return 'commander';
    if (raw === 'student') return 'gladiator';
    if (raw && (VALID_ROLES as readonly string[]).includes(raw.trim())) {
      return raw.trim() as AppRole;
    }
    console.warn('AuthContext: invalid role in Firestore user document', raw);
    return null;
  }, []);

  // SIH-26242: new accounts on this branch are RPL CANDIDATES, never Quorena
  // gladiators (A3). No gladiator profile is ever created here.
  const buildFallbackProfile = useCallback((uid: string, defaults?: { name?: string; email?: string; photoURL?: string }): User => ({
    id: uid,
    name: defaults?.name || auth?.currentUser?.displayName || 'Candidate',
    email: defaults?.email || auth?.currentUser?.email || '',
    avatar: defaults?.photoURL || auth?.currentUser?.photoURL || getRandomAvatar(),
    role: 'candidate' as const,
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
          const displayName = defaults?.name || auth.currentUser?.displayName || 'Candidate';
          const email = defaults?.email || auth.currentUser?.email || '';
          const photoURL = defaults?.photoURL || auth.currentUser?.photoURL || undefined;
          const avatar = photoURL || getRandomAvatar();

          // SIH-26242: self-serve accounts are RPL candidates (A3) — this
          // branch must not create Quorena gladiator profiles. The Firestore
          // rule allows client self-create with role 'candidate'.
          const newUser: User = {
            id: uid,
            name: displayName,
            email,
            avatar,
            role: 'candidate',
          };
          transaction.set(userRef, {
            name: newUser.name,
            email: newUser.email,
            avatar: newUser.avatar,
            role: 'candidate',
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
        if (!profile.role || !(VALID_ROLES as readonly string[]).includes(profile.role)) {
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

  // Migrate existing ID token to session cookie on load (existing users with no session cookie).
  // Covers the Google signInWithRedirect return path (whole-tab redirect, no
  // login() call). Best-effort but status-checked: only marks done on success
  // so a transient failure retries on the next auth-state tick instead of
  // stranding the user with Firebase auth but no server cookie (middleware
  // would then bounce every portal nav to /login).
  // Phase A2: mintSessionCookie also completes the role-claim handshake
  // (server returns claimsRefresh -> forced token refresh -> re-mint), so the
  // cookie always carries `role` for the edge middleware.
  const migrateSession = useCallback(async () => {
    if (migrationDone.current) return;
    if (migrationAttempts.current >= MIGRATION_MAX_ATTEMPTS) {
      console.error(
        '[Auth] session mint still failing after ' + MIGRATION_MAX_ATTEMPTS + ' attempts',
      );
      setAuthError('Could not establish a server session after several attempts — please reload or sign in again.');
      return;
    }
    migrationAttempts.current += 1;
    const user = auth?.currentUser;
    if (!user) return;
    try {
      const result = await withTimeout(
        mintSessionCookie((forceRefresh) => user.getIdToken(forceRefresh)),
        AUTH_OP_TIMEOUT_MS,
        'Session creation',
      );
      if (!result.ok) {
        console.error('[Auth] session mint failed', result.errorCode, result.errorMessage);
        return;
      }
      migrationDone.current = true;
    } catch (err) {
      console.error('[Auth] session mint error', getErrorMessage(err));
    }
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    // Return path from a redirect-based sign-in. The app now uses
    // signInWithPopup exclusively, so a non-null result here means a STALE
    // redirect (e.g. a tab left open on the old code). Keep the call as a
    // safety net and trace its outcome under ?debug=1 — this is exactly the
    // signal that went missing when third-party storage partitioning ate the
    // redirect result on cross-origin previews (signInWithRedirect bug).
    void getRedirectResult(auth)
      .then((cred) => {
        if (cred?.user) {
          debugLog('getRedirectResult: returned user', { uid: cred.user.uid });
        } else {
          debugLog('getRedirectResult: null (no pending redirect)');
        }
      })
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code || '';
        const msg = getErrorMessage(err);
        // No pending redirect is the normal case on a plain page load.
        if (code === 'auth/no-auth-event' || msg.includes('no-auth-event')) {
          debugLog('getRedirectResult: no pending redirect (no-auth-event)');
          return;
        }
        console.error('[Auth] Google redirect return failed', code, msg);
        setIsLoading(false);
        setAuthError(
          `Google sign-in did not complete${code ? ` (${code})` : ''}: ${msg}. Please try again.`,
        );
        toast({
          variant: 'destructive',
          title: 'Google Sign-In Failed',
          description: `${msg || 'The sign-in redirect failed.'} Please try again.`,
        });
      });
    if (isUserLoading) { setIsLoading(true); return; }
    debugLog('auth state', {
      hasFirebaseUser: !!firebaseUser,
      uid: firebaseUser?.uid ?? null,
      hasCurrentUser: !!auth.currentUser,
    });
    if (firebaseUser) {
      // During email/password signup the profile doc is created server-side at
      // session mint (Firestore rules only allow client self-create with role
      // 'gladiator'); skip the effect-driven fetch so ensureGladiatorProfile
      // cannot race it — signUp() fetches explicitly once the mint completes.
      // The same holds for login (loginInProgress): login() fetches explicitly
      // on success so a failed mint keeps its specific server error.
      if (signupInProgress.current || loginInProgress.current) { return; }
      fetchUserDocument(firebaseUser.uid);
      void migrateSession();
    } else {
      migrationDone.current = false;
      migrationAttempts.current = 0;
      setUser(null);
      fetchInProgress.current = false;
      fetchInProgressUid.current = null;
      setIsLoading(false);
    }
  }, [firebaseUser, isUserLoading, fetchUserDocument, migrateSession, firestore, auth, toast]);

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
    // Own the profile fetch for this interactive flow (see the auth-state
    // effect) so a failed mint keeps its specific server error.
    loginInProgress.current = true;
    try {
      const email = credentials.email.trim();
      await withTimeout(checkRateLimit('login', email), RATE_LIMIT_TIMEOUT_MS, 'Rate limit check');
      await withTimeout(signInWithEmailAndPassword(auth, email, credentials.password), AUTH_OP_TIMEOUT_MS, 'Sign in');

      const currentUser = auth.currentUser;
      if (!currentUser) {
        await signOut(auth);
        toast({ variant: "destructive", title: "Sign In Failed", description: "Unable to verify account." });
        throw new Error("Unable to verify account.");
      }

      // Claim the mint for this login. The auth-state effect fires as soon as
      // signInWithEmailAndPassword sets the Firebase user and would otherwise
      // POST a SECOND session cookie for the same user (mirrors
      // signInWithGoogle). login() owns the mint for the interactive path.
      migrationDone.current = true;

      // Mint the server session cookie NOW and fail hard if it fails —
      // otherwise the client thinks it is signed in while middleware
      // (cookie-gated) bounces every portal navigation back to /login.
      // The SERVER is the role authority (env lists > claim > user doc); the
      // client no longer gates login by role. mintSessionCookie completes the
      // role-claim handshake (claimsRefresh -> forced refresh -> re-mint) so
      // the cookie always carries `role`.
      try {
        const sessionResult = await withTimeout(
          mintSessionCookie((forceRefresh) => currentUser.getIdToken(forceRefresh)),
          AUTH_OP_TIMEOUT_MS,
          'Session creation',
        );
        if (!sessionResult.ok) {
          await signOut(auth).catch(() => {});
          const friendly = sessionResult.errorMessage || 'Sign-in failed — please try again';
          // Surface the server's OWN code (e.g. SERVICE_ACCOUNT_PROJECT_MISMATCH)
          // plus its message so the operator sees the exact misconfiguration.
          const codeFragment = sessionResult.errorCode ? ` (${sessionResult.errorCode})` : '';
          const message = `Sign-in failed${codeFragment} — ${friendly}`;
          console.error('[Auth] login session mint failed', sessionResult.errorCode, sessionResult.errorMessage);
          setAuthError(message);
          setIsLoading(false);
          throw new Error(message);
        }
      } catch (e) {
        // Preserve the crafted message (which may carry the server's own code,
        // e.g. "Sign-in failed (SERVICE_ACCOUNT_PROJECT_MISMATCH) — ..."). A
        // strict em-dash prefix check used to miss the coded variant and
        // overwrite it with the generic message, hiding the real cause.
        if (e instanceof Error && e.message.startsWith('Sign-in failed')) throw e;
        await signOut(auth).catch(() => {});
        if (isTimeoutError(e)) {
          setAuthError("Sign-in failed — please try again");
          toast({ variant: "destructive", title: "Sign In Failed", description: "Request timed out. Please try again." });
          throw new Error("Request timed out. Please try again.");
        }
        setAuthError("Sign-in failed — please try again");
        toast({ variant: "destructive", title: "Sign In Failed", description: "Could not establish server session. Please try again." });
        throw new Error("Sign-in failed — please try again");
      }

      // Mint succeeded — populate client state from the authoritative user doc
      // (the auth-state effect is suppressed while loginInProgress is true).
      await fetchUserDocument(currentUser.uid);
    } catch (error: unknown) {
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Too Many Attempts", description: "Too many attempts. Please wait a moment and try again." });
        // Ensure loading is not stuck
        setIsLoading(false);
        throw error;
      }
      if (error instanceof Error && (
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
    } finally {
      loginInProgress.current = false;
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
      // Popup flow — NOT signInWithRedirect. Whole-tab redirects lose the
      // auth result under third-party storage partitioning on cross-origin
      // previews (*.vercel.app with a firebaseapp.com authDomain): the
      // getRedirectResult() call comes back null, no user state exists, and
      // POST /api/auth/session is never sent. signInWithPopup keeps the
      // result in this tab's JS context, so the auth-state effect always sees
      // the user and mints the cookie. The popup MUST be triggered
      // synchronously inside the click gesture (no awaits before this call)
      // or browsers block it.
      await signInWithPopup(auth, provider);
      // The auth-state effect fetches/creates the profile. Mint the server
      // session cookie here so a failure is surfaced immediately (same
      // fail-hard contract as login()) instead of after 3 background retries.
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Claim the mint for the background migrateSession() so it does not
        // race this one with a duplicate POST.
        migrationDone.current = true;
        try {
          const sessionResult = await withTimeout(
            // A3: Google sign-in uses the SAME signupRole handshake as
            // email/password sign-up, so a brand-new Google user is created as
            // an RPL candidate server-side. Existing accounts keep their role
            // (the server never overwrites an existing user doc).
            mintSessionCookie(
              (forceRefresh) => currentUser.getIdToken(forceRefresh),
              fetch,
              { signupRole: 'candidate', signupName: currentUser.displayName || '' },
            ),
            AUTH_OP_TIMEOUT_MS,
            'Session creation',
          );
          if (!sessionResult.ok) {
            if (sessionResult.errorCode === 'ROLE_MISSING') {
              // First Google sign-in: the profile doc is still being created
              // by fetchUserDocument (open gladiator signup). The effect
              // re-mints once the doc lands — do NOT sign the user out.
              debugLog('google mint deferred: profile doc still being created');
              migrationDone.current = false;
            } else {
              const friendly = sessionResult.errorMessage || 'Sign-in failed — please try again';
              const codeFragment = sessionResult.errorCode ? ` (${sessionResult.errorCode})` : '';
              const message = `Sign-in failed${codeFragment} — ${friendly}`;
              console.error('[Auth] google session mint failed', sessionResult.errorCode, sessionResult.errorMessage);
              migrationDone.current = false;
              await signOut(auth).catch(() => {});
              setAuthError(message);
              setIsLoading(false);
              toast({ variant: "destructive", title: "Google Sign-In Failed", description: message });
            }
          } else {
            debugLog('google session mint ok', { role: sessionResult.role });
          }
        } catch (e) {
          migrationDone.current = false;
          if (isTimeoutError(e) || isPermissionDenied(e)) {
            await signOut(auth).catch(() => {});
            setAuthError("Sign-in failed — please try again");
            setIsLoading(false);
            toast({ variant: "destructive", title: "Google Sign-In Failed", description: "Could not establish server session. Please try again." });
            return;
          }
          throw e;
        }
      }
      // Part 5A: domain is enforced at arena-join, not at Google sign-in.
    } catch (error: unknown) {
      console.error('[Auth] signInWithPopup error', error);
      setIsLoading(false);
      const mapped = mapFirebaseAuthError(error, 'google');
      // Popup codes are never silent (RPL Compass contract): the caller shows
      // the message INLINE on the login form. Keep a defensive silent-guard so
      // a future deliberately-silent code cannot spin the UI forever.
      if (mapped.isSilent) return;
      toast({ variant: 'destructive', title: mapped.title, description: mapped.message });
      setAuthError(null);
      // Rethrow the user-facing message so LoginForm renders it inline instead
      // of triggering a full-screen ClientLayout auth-error takeover.
      throw new Error(mapped.message || 'Google sign-in was blocked in this browser. Use email and password instead.');
    }
  }, [auth, toast]);

  const signUp = async (data: { name: string; email: string; password: string }) => {
    setAuthError(null);
    if (!auth) throw new Error('Auth service not available');
    const email = data.email.trim();
    const name = data.name.trim();
    // Block the auth-state effect from fetching a profile while we create the
    // account: Firestore rules only allow client self-create with role
    // 'gladiator', so the candidate user doc is created server-side during the
    // session mint (signupRole: 'candidate'). A racing fetchUserDocument would
    // otherwise create a gladiator doc first and the mint would see it.
    signupInProgress.current = true;
    let serverError: string | null = null;
    try {
      await withTimeout(checkRateLimit('signup', email), RATE_LIMIT_TIMEOUT_MS, 'Rate limit check');
      const cred = await withTimeout(
        createUserWithEmailAndPassword(auth, email, data.password),
        AUTH_OP_TIMEOUT_MS,
        'Account creation',
      );
      try {
        // firebase v11: updateProfile is a standalone function, not a User method.
        await setFirebaseDisplayName(cred.user, { displayName: name });
      } catch (err) {
        // Non-fatal: the display name is cosmetic; the user doc (created
        // server-side below) is the authoritative record.
        console.warn('[Auth] displayName update failed', getErrorMessage(err));
      }
      // Server creates users/{uid} with role 'candidate' (Admin SDK bypasses
      // the gladiator-only client rules) and runs the claims handshake.
      const sessionResult = await withTimeout(
        mintSessionCookie(
          (forceRefresh) => cred.user.getIdToken(forceRefresh),
          fetch,
          { signupRole: 'candidate', signupName: name },
        ),
        AUTH_OP_TIMEOUT_MS,
        'Session creation',
      );
      if (!sessionResult.ok) {
        serverError = sessionResult.errorMessage || 'Account creation failed — please try again';
        console.error('[Auth] signup session mint failed', sessionResult.errorCode, sessionResult.errorMessage);
        setAuthError(serverError);
        throw new Error(serverError);
      }
      migrationDone.current = true;
      signupInProgress.current = false;
      // Doc now exists with role candidate — safe to populate client state.
      await fetchUserDocument(cred.user.uid);
      debugLog('signup ok', { uid: cred.user.uid, role: sessionResult.role });
    } catch (error: unknown) {
      signupInProgress.current = false;
      // Never leave a half-authenticated account behind: without the cookie
      // the middleware bounces every page, and the user can simply sign in
      // again (the candidate doc is created by the mint above).
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
      setUser(null);
      setIsLoading(false);
      if (serverError) {
        toast({ variant: "destructive", title: "Account Creation Failed", description: serverError });
        throw error;
      }
      if (error instanceof Error && (error.message.includes('Too many') || error.message.includes('Please wait'))) {
        toast({ variant: "destructive", title: "Too Many Attempts", description: error.message });
        throw error;
      }
      const mapped = mapFirebaseAuthError(error, 'signup');
      if (!mapped.isSilent) {
        setAuthError(mapped.message);
        toast({ variant: "destructive", title: mapped.title, description: mapped.message });
      }
      throw new Error(mapped.message || 'Account creation failed — please try again.');
    }
  };

  const sendPasswordReset = async (email: string) => {
    if (!auth) throw new Error('Auth service not available');
    const trimmed = email.trim();
    await withTimeout(checkRateLimit('login', trimmed), RATE_LIMIT_TIMEOUT_MS, 'Rate limit check');
    try {
      await withTimeout(sendPasswordResetEmail(auth, trimmed), AUTH_OP_TIMEOUT_MS, 'Password reset');
    } catch (error: unknown) {
      // Enumeration guard: an unregistered email must resolve exactly like a
      // successful send (the caller shows the same non-enumerating message).
      const code = (error as { code?: string } | null)?.code ?? '';
      const msg = error instanceof Error ? error.message : '';
      if (code === 'auth/user-not-found' || msg.includes('user-not-found')) return;
      const mapped = mapFirebaseAuthError(error, 'login');
      throw new Error(mapped.message || 'Could not send the reset email. Please try again.');
    }
  };

  const logout = async () => {
    if (!auth) return;
    setAuthError(null);
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
    } catch {
      // server-side logout best-effort
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

  // NOTE on the dep array below: login/logout/updateAvatar/updateProfile are
  // intentionally excluded. They are recreated every render, so depending on
  // them would defeat this memo (new value object every render, re-rendering
  // all consumers) with zero staleness benefit — they only close over stable
  // singletons (auth, firestore, toast) and React state setters, so they can
  // never go stale.
  const contextValue = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    authError,
    clearAuthError,
    login,
    signUp,
    signInWithGoogle,
    sendPasswordReset,
    logout,
    updateAvatar,
    updateProfile,
    refreshUser,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, isLoading, authError, clearAuthError, signInWithGoogle, refreshUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
