import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function KickedPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-center">
      <ShieldAlert className="w-24 h-24 text-destructive mb-6" />
      <h1 className="text-4xl font-headline text-destructive mb-2">You Have Been Blocked</h1>
      <p className="text-xl text-muted-foreground mb-8 max-w-md">
        Malpractice was detected because you navigated away from the quiz tab. Fair play is required in the arena. Wait for your teacher to reset your attempt.
      </p>
      <Link href="/student/dashboard" passHref>
        <Button variant="outline" size="lg">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
