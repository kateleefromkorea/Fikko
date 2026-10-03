// Two-factor step for /admin. The first time, the admin scans a QR code into
// an authenticator app (Google Authenticator, 1Password and so on); after
// that, each new sign-in asks for the app's current 6-digit code. A correct
// code upgrades the session to "aal2", which admin_stats requires.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Setup { qr: string; secret: string }

export default function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Only once, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setError("Couldn't load your security settings. Reload to try again.");
      const verified = data.totp[0];
      if (verified) return setFactorId(verified.id);

      // First time: clear out any half-finished setup, then start a fresh one.
      for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Fikko admin" });
      if (enrolled.error) return setError("Couldn't start the setup. Reload to try again.");
      setFactorId(enrolled.data.id);
      setSetup({ qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setCode("");
      return setError("That code didn't work. Codes change every 30 seconds, so try the current one.");
    }
    onVerified();
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          {setup ? "Set up two-step sign-in" : "Enter your code"}
        </CardTitle>
        <CardDescription>
          {setup
            ? "The admin page needs a code from an authenticator app as well as your password. Scan this QR code with Google Authenticator, 1Password or a similar app."
            : "Open your authenticator app and enter the 6-digit code for Fikko."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {setup && (
          <div className="space-y-3">
            <img src={setup.qr} alt="QR code to add Fikko to your authenticator app" className="mx-auto size-44 rounded-lg bg-white p-2 ring-1 ring-foreground/10" />
            <p className="text-center text-xs text-muted-foreground">
              Can't scan it? Enter this key instead:
              <code className="mt-1 block font-mono text-sm tracking-wider break-all text-foreground select-all">{setup.secret}</code>
            </p>
          </div>
        )}
        {factorId && (
          <form onSubmit={verify} className="space-y-3">
            <Label htmlFor="admin-code">6-digit code</Label>
            <Input
              id="admin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-10 text-center font-mono text-lg tracking-[0.4em]"
            />
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
