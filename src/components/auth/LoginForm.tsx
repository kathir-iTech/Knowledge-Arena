"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().min(1, { message: 'Email is required.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

const signUpSchema = z
  .object({
    name: z.string().min(1, { message: 'Name is required.' }),
    email: z.string().min(1, { message: 'Email is required.' }),
    password: z.string().min(1, { message: 'Password is required.' }),
    confirmPassword: z.string().min(1, { message: 'Confirm your password.' }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;
type Tab = 'signin' | 'signup';

// Non-blocking strength hint (never prevents submission — Firebase enforces
// its own minimum; this just nudges toward a better password up front).
function passwordStrengthHint(pw: string): { label: string; className: string } | null {
  if (!pw) return null;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (pw.length >= 12 && classes >= 3) {
    return { label: 'Strong password', className: 'text-success' };
  }
  if (pw.length >= 8 && classes >= 2) {
    return { label: 'Fair password — add length or variety to strengthen', className: 'text-muted-foreground' };
  }
  return { label: 'Weak password — use at least 8 characters with mixed types', className: 'text-destructive' };
}

function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11"
      onClick={onClick}
      disabled={disabled}
      aria-label="Continue with Google"
    >
      <svg className="mr-2 h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </Button>
  );
}

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: Tab;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`auth-tab-${id}`}
      aria-selected={active}
      aria-controls={`auth-panel-${id}`}
      onClick={onClick}
      className={
        active
          ? 'flex-1 rounded-[10px] bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors'
          : 'flex-1 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/30'
      }
    >
      {label}
    </button>
  );
}

interface LoginFormProps {
  initialValues?: { email?: string; password?: string };
}

export function LoginForm({ initialValues }: LoginFormProps = {}) {
  const { login, signUp, signInWithGoogle, sendPasswordReset } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  // Phase A4: a visible, non-spinning failure state on the page itself —
  // the toast disappears, this stays until the user retries.
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [signUpPassword, setSignUpPassword] = useState('');

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: initialValues?.email || '', password: initialValues?.password || '' },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (initialValues?.email) signInForm.setValue('email', initialValues.email, { shouldDirty: true });
    if (initialValues?.password) signInForm.setValue('password', initialValues.password, { shouldDirty: true });
  }, [initialValues, signInForm]);

  // Accessibility: after a failed submit, move focus to the first invalid
  // field so a keyboard/screen-reader user lands exactly where the error is.
  // Keyed on submitCount (not the errors object) so later typing never steals
  // focus; the error list is read one tick later, once zod validation settles.
  const lastSignInSubmit = useRef(0);
  useEffect(() => {
    const count = signInForm.formState.submitCount;
    if (count === 0 || count === lastSignInSubmit.current) return;
    lastSignInSubmit.current = count;
    const id = window.setTimeout(() => {
      const [firstName] = Object.keys(signInForm.formState.errors);
      if (!firstName) return;
      document.querySelector<HTMLInputElement>(`input[name="${firstName}"]`)?.focus();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signInForm.formState.submitCount]);

  const lastSignUpSubmit = useRef(0);
  useEffect(() => {
    const count = signUpForm.formState.submitCount;
    if (count === 0 || count === lastSignUpSubmit.current) return;
    lastSignUpSubmit.current = count;
    const id = window.setTimeout(() => {
      const [firstName] = Object.keys(signUpForm.formState.errors);
      if (!firstName) return;
      document.querySelector<HTMLInputElement>(`input[name="${firstName}"]`)?.focus();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signUpForm.formState.submitCount]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setFormError(null);
    setResetMessage(null);
  };

  const onSignInSubmit = async (values: SignInValues) => {
    setIsSubmitting(true);
    setFormError(null);
    setResetMessage(null);
    try {
      await login(values);
      // Success: the auth state updates and ClientLayout routes to the
      // remembered ?next= destination (same-origin only) or the role home.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setFormError({ title: 'Sign-in failed', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSignUpSubmit = async (values: SignUpValues) => {
    setIsSubmitting(true);
    setFormError(null);
    setResetMessage(null);
    try {
      await signUp({ name: values.name, email: values.email, password: values.password });
      // Success: candidate account + session cookie created; ClientLayout
      // routes to ?next= or the candidate home (/rpl).
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account creation failed. Please try again.';
      setFormError({ title: 'Account creation failed', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogleSignIn = async () => {
    setFormError(null);
    setResetMessage(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      // Inline, non-spinning message for EVERY Google failure (popup blocked,
      // popup closed, any other error). Never a silent no-op.
      const mapped = err instanceof Error ? err.message : '';
      setFormError({
        title: 'Google sign-in failed',
        message:
          mapped ||
          'Google sign-in was blocked in this browser. Use email and password instead.',
      });
    }
  };

  const onForgotPassword = async () => {
    setFormError(null);
    setResetMessage(null);
    const email = signInForm.getValues('email')?.trim();
    if (!email) {
      setFormError({
        title: 'Password reset',
        message: 'Enter your email above first, then request a reset link.',
      });
      return;
    }
    setIsResetting(true);
    try {
      await sendPasswordReset(email);
      setResetMessage('If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      setFormError({
        title: 'Password reset failed',
        message: err instanceof Error ? err.message : 'Could not send the reset email. Please try again.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const strength = passwordStrengthHint(signUpPassword);

  return (
    <Card>
      <CardContent className="pt-6 px-4 sm:px-6 space-y-6">
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">{formError.title}</p>
            <p className="mt-1 text-xs text-muted-foreground break-words">{formError.message}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setFormError(null)}>
              Try again
            </Button>
          </div>
        )}
        {resetMessage && (
          <div role="status" className="rounded-lg border border-border/60 bg-accent/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground break-words">{resetMessage}</p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" role="note">
            Sign in with Google, or use the email and password tabs below. New accounts start as
            candidates; assessors and admins are invited by email.
          </p>
          <GoogleButton onClick={onGoogleSignIn} disabled={isSubmitting} />
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-4">
          <div role="tablist" aria-label="Authentication method" className="flex gap-1 rounded-[12px] border border-border/60 p-1">
            <TabButton id="signin" label="Sign in" active={tab === 'signin'} onClick={() => switchTab('signin')} />
            <TabButton id="signup" label="Create account" active={tab === 'signup'} onClick={() => switchTab('signup')} />
          </div>

          {tab === 'signin' ? (
            <div key="signin" role="tabpanel" id="auth-panel-signin" aria-labelledby="auth-tab-signin" className="space-y-4">
              <Form {...signInForm}>
                <form onSubmit={signInForm.handleSubmit(onSignInSubmit)} className="space-y-4">
                  <FormField
                    control={signInForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            {...field}
                            autoComplete="username"
                            inputMode="email"
                            aria-invalid={!!signInForm.formState.errors.email}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signInForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-sm font-medium">Password</FormLabel>
                          <button
                            type="button"
                            onClick={onForgotPassword}
                            disabled={isResetting}
                            className="text-xs text-primary hover:underline disabled:opacity-50"
                          >
                            {isResetting ? 'Sending…' : 'Forgot password?'}
                          </button>
                        </div>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            autoComplete="current-password"
                            aria-invalid={!!signInForm.formState.errors.password}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting} aria-label="Sign in">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </Form>
            </div>
          ) : (
            <div key="signup" role="tabpanel" id="auth-panel-signup" aria-labelledby="auth-tab-signup" className="space-y-4">
              <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-4">
                  <FormField
                    control={signUpForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Full name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your name"
                            {...field}
                            autoComplete="name"
                            aria-invalid={!!signUpForm.formState.errors.name}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            {...field}
                            autoComplete="email"
                            inputMode="email"
                            aria-invalid={!!signUpForm.formState.errors.email}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            autoComplete="new-password"
                            onChange={(e) => {
                              setSignUpPassword(e.target.value);
                              field.onChange(e);
                            }}
                            aria-invalid={!!signUpForm.formState.errors.password}
                          />
                        </FormControl>
                        {strength && (
                          <p className={`text-xs ${strength.className}`} role="note">
                            {strength.label}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Confirm password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            autoComplete="new-password"
                            aria-invalid={!!signUpForm.formState.errors.confirmPassword}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting} aria-label="Create account">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create account
                  </Button>
                </form>
              </Form>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
