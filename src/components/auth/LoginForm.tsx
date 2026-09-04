"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, { message: "Email or Staff ID is required." }),
  password: z.string().min(1, { message: "Password is required." }),
});

interface LoginFormProps {
  initialValues?: { email?: string; password?: string };
}

export function LoginForm({ initialValues }: LoginFormProps = {}) {
  const { login, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: initialValues?.email || '', password: initialValues?.password || '' },
  });

  useEffect(() => {
    if (initialValues?.email) loginForm.setValue('email', initialValues.email, { shouldDirty: true });
    if (initialValues?.password) loginForm.setValue('password', initialValues.password, { shouldDirty: true });
  }, [initialValues, loginForm]);

  const onLoginSubmit = async (values: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    try {
      await login(values);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      toast({ variant: 'destructive', title: 'Login Failed', description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const onGoogleSignIn = async () => {
    await signInWithGoogle();
  };

  return (
    <Card>
      <CardContent className="pt-6 px-4 sm:px-6 space-y-6">
        {/* Section 1: Gladiators — Sign in with Google (Part 5A: open signup) */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Gladiators — Sign in with Google</h2>
          <p className="text-xs text-muted-foreground" role="note">Any Google account can sign in. Battle access is controlled per arena.</p>
          <Button type="button" variant="outline" className="w-full h-11" onClick={onGoogleSignIn} disabled={isLoading} aria-label="Continue with Google — Gladiators">
            <svg className="mr-2 h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Section 2: Staff login — Commanders and Executives (email + password) */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Staff login — Commanders &amp; Executives</h2>
          <p className="text-xs text-muted-foreground">Accounts are created by your Executive. Sign in with your email (or Staff ID) and password.</p>
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
              <FormField
                control={loginForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email or Staff ID</FormLabel>
                    <FormControl>
                      <Input placeholder="admin_001_1 or email" {...field} autoComplete="username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading} aria-label="Staff Sign In">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  );
}
