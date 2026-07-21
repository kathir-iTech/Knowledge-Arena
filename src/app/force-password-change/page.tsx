"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required." }),
  newPassword: z.string().min(6, { message: "New password must be at least 6 characters." }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ForcePasswordChangePage() {
  const { user } = useAuth();
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  if (!user) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">You must be signed in to change your password.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (!auth || !firestore || !user) return;
    setIsLoading(true);

    try {
      const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, values.newPassword);
      await updateDoc(doc(firestore, 'users', user.id), { mustChangePassword: false });

      toast({ title: "Password changed", description: "Your password has been updated successfully." });

      const dashboardMap: Record<string, string> = {
        executive: '/executive/analytics',
        commander: '/commander/dashboard',
        gladiator: '/gladiator/dashboard',
      };
      router.replace(dashboardMap[user.role] || '/gladiator/dashboard');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to change password.';
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        toast({ variant: "destructive", title: "Incorrect Password", description: "Current password is incorrect." });
      } else if (msg.includes('weak-password')) {
        toast({ variant: "destructive", title: "Weak Password", description: "New password must be at least 6 characters." });
      } else {
        toast({ variant: "destructive", title: "Error", description: msg });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-amber-500/10 p-3">
              <ShieldAlert className="h-6 w-6 text-amber-500" />
            </div>
          </div>
          <CardTitle>Change Your Password</CardTitle>
          <CardDescription>
            This is a temporary password. Please set a new password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
