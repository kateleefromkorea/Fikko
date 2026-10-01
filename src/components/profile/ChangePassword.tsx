import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Inline form for a signed-in member to change their password. The current
 * password is checked first, so someone using an unlocked device can't
 * quietly take over the account.
 */
export default function ChangePassword({ email, onClose }: { email: string; onClose: (changed: boolean) => void }) {
  const { updatePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Those new passwords don't match.");
    if (password === current) return setError("Choose a password different from your current one.");
    setError(null);
    setSubmitting(true);
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setSubmitting(false);
      return setError("Your current password isn't right.");
    }
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) return setError(error);
    onClose(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-5">
      <p className="text-sm font-medium">Change password</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input id="current-password" type="password" required autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="change-new-password">New password</Label>
          <Input id="change-new-password" type="password" required minLength={6} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="change-confirm-password">Confirm new password</Label>
          <Input id="change-confirm-password" type="password" required minLength={6} autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">At least 6 characters.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting} className="h-9 px-4">
          {submitting && <Loader2 className="animate-spin" />}
          Save new password
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={submitting} className="h-9 px-4">
          Cancel
        </Button>
      </div>
    </form>
  );
}
