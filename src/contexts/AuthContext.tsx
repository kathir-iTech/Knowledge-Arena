
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const lastFetchedUid = useRef<string | null>(null);

  const getRandomAvatar = useCallback(() => {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  }, []);

  const fetchUserDocument = useCallback(async (uid: string) => {
    if (!firestore) return;
    if (lastFetchedUid.current === uid && user) return;
    lastFetchedUid.current = uid;
    try {
        const userRef = doc(firestore, 'users', uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            setUser({ id: userDoc.id, ...userDoc.data() } as User);
        } else {
            const recovered: User = {
              id: uid,
              name: auth?.currentUser?.displayName || 'Gladiator',
              email: auth?.currentUser?.email || '',
              avatar: getRandomAvatar(),
              role: 'gladiator',
            };
            try {
              await setDoc(userRef, {
                name: recovered.name,
                email: recovered.email,
                avatar: recovered.avatar,
                role: 'gladiator',
              });
              setUser(recovered);
            } catch {
              setUser(null);
            }
        }
    } catch (err) {
        console.error('AuthContext: fetchUserDocument error', err);
        setUser(null);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, auth, getRandomAvatar]);

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

    const role = 'gladiator';

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
         default:
           if (err.code === 'permission-denied' || err.code === 'unavailable' || err.code === 'failed-precondition') {
             description = 'Account creation is currently unavailable. Please try again.';
           } else {
             description = 'An unexpected error occurred. Please try again.';
           }
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
