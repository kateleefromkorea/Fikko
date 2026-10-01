import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  userId: string;
  /** When the account will be permanently deleted. */
  scheduledFor: string;
  /** Clears the pending deletion in the app's copy of the profile. */
  onRestored: () => void;
}

/**
 * Shown when a member signs in to an account they asked to delete, during the
 * grace period. Restoring is a deliberate choice: signing in alone doesn't
 * cancel the deletion.
 */
export default function RestoreAccount({ userId, scheduledFor, onRestored }: Props) {
  const { signOut } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = new Date(scheduledFor).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  async function restore() {
    setRestoring(true);
    setError(null);
    // Written here rather than through the optimistic profile update so this
    // screen only goes away once the database has actually cleared it.
    const { error } = await supabase.from("profiles").update({ deletion_scheduled_for: null }).eq("user_id", userId);
    setRestoring(false);
    if (error) return setError("We couldn't restore your account. Please try again.");
    onRestored();
  }

  return (
    <div className="hero-wash flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-screen-2xl items-center px-4 sm:px-6">
        <span className="text-lg font-bold tracking-wide">FIKKO</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm gap-6 shadow-xl shadow-teal/10 [--card-spacing:--spacing(8)]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Welcome back</CardTitle>
            <CardDescription>
              Your account is set to be permanently deleted on <span className="font-medium text-foreground">{date}</span>.
              Restore it to pick up where you left off. All your history is still here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={restore} disabled={restoring} className="h-10 w-full">
              {restoring && <Loader2 className="animate-spin" />}
              Restore my account
            </Button>
            <Button variant="link" onClick={() => void signOut()} className="h-auto w-full p-0 text-muted-foreground">
              Keep it scheduled and sign out
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
