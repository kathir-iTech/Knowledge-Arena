import { LoginForm } from '@/components/auth/LoginForm';
import { BotMessageSquare } from 'lucide-react';

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
           <BotMessageSquare className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-4xl font-headline text-primary">Cyber Gladiators</h1>
          <p className="text-muted-foreground">Enter the arena of knowledge. Sign in or create your account.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
