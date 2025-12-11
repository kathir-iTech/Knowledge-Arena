
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function CheatingDetectedPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-center">
      <ShieldAlert className="w-24 h-24 text-destructive mb-6" />
      <h1 className="text-4xl font-headline text-destructive mb-2">Action Blocked</h1>
      <p className="text-xl text-muted-foreground mb-8 max-w-md">
        Your attempt to join the battle was denied by the server's rules. Please contact your teacher if you believe this is an error.
      </p>
      <Link href="/" passHref>
        <Button variant="outline" size="lg">
          Return to Dashboard
        </Button>
      </Link>
    </main>
  );
}
