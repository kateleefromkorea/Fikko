import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shown after following a password-reset email. The link has already signed
 * the member in; this asks for the new password before letting them into the app.
 */
export default function SetNewPassword() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Those passwords don't match.");
    setError(null);
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <div className="hero-wash flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-screen-2xl items-center px-4 sm:px-6">
        <span className="text-lg font-bold tracking-wide">FIKKO</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm gap-6 shadow-xl shadow-teal/10 [--card-spacing:--spacing(8)]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Choose a new password</CardTitle>
            <CardDescription>At least 6 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-10"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="h-10 w-full">
                {submitting && <Loader2 className="animate-spin" />}
                Save new password
              </Button>
              <Button type="button" variant="link" onClick={() => void signOut()} className="h-auto w-full p-0 text-muted-foreground">
                Cancel and sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
