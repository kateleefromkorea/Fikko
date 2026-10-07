import { useEffect, useState } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { INVITE_ONLY, PROVIDER_INFO, fetchBetaAccess, requestBetaInvite, type BetaAccess, type Provider } from "../../lib/devices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Whether this member may connect a provider that's in an invite-only beta.
 * `canConnect` is true for providers that aren't invite-only, for invited
 * members, and for members who were connected before the beta began.
 */
export function useBetaAccess(provider: Provider, connected: boolean) {
  const inviteOnly = INVITE_ONLY.includes(provider);
  const [access, setAccess] = useState<BetaAccess | null>(null);
  const [loading, setLoading] = useState(inviteOnly);

  useEffect(() => {
    if (!inviteOnly) return;
    let live = true;
    void fetchBetaAccess(provider).then((a) => {
      if (!live) return;
      setAccess(a);
      setLoading(false);
    });
    return () => { live = false; };
  }, [provider, inviteOnly]);

  return {
    inviteOnly,
    access,
    setAccess,
    loading,
    canConnect: !inviteOnly || connected || access?.status === "invited",
  };
}

/**
 * Shown instead of Connect while a provider is invite-only: a short request
 * form, then where the request stands.
 */
export default function WearableBetaInvite({ provider, access, onRequested }: {
  provider: Provider;
  access: BetaAccess | null;
  onRequested: (access: BetaAccess) => void;
}) {
  const { user } = useAuth();
  const name = PROVIDER_INFO[provider].name;
  const [editing, setEditing] = useState(!access);
  const [email, setEmail] = useState(access?.googleEmail ?? user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await requestBetaInvite(provider, email.trim());
      onRequested({ status: access?.status === "declined" ? "declined" : "requested", googleEmail: email.trim().toLowerCase() });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!editing && access) {
    const declined = access.status === "declined";
    return (
      <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm">
        {declined
          ? <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{declined ? "The beta is full for now" : "Invite requested"}</p>
          <p className="text-muted-foreground">
            {declined
              ? `We'll let you know when ${name} opens to more members.`
              : <>We&apos;ll let you know when you can connect. Your Google account: <span className="break-all text-foreground">{access.googleEmail}</span></>}
          </p>
        </div>
        {!declined && (
          <Button variant="link" onClick={() => setEditing(true)} className="h-auto p-0 text-sm">
            Change
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-2 rounded-lg bg-muted/60 px-4 py-3">
      <p className="text-sm">
        <span className="font-medium">{name} is in an invite-only beta.</span>{" "}
        <span className="text-muted-foreground">Tell us which Google account you&apos;ll connect, and we&apos;ll let you know when you&apos;re in.</span>
      </p>
      <Label htmlFor={`beta-email-${provider}`} className="sr-only">Google account email</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`beta-email-${provider}`}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@gmail.com"
          className="h-9 min-w-0 flex-1 basis-56 bg-background"
        />
        <Button type="submit" disabled={sending || !email.trim()} className="h-9">
          {sending && <Loader2 className="animate-spin" />}
          Request an invite
        </Button>
        {access && (
          <Button type="button" variant="ghost" onClick={() => { setEditing(false); setEmail(access.googleEmail); }} className="h-9">
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">The Google account your Fitbit or Pixel Watch uses. It can be different from your Fikko email.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

/**
 * Renders `children` (the Connect button) when the member may connect, and the
 * invite request in its place, full width, while they may not.
 */
export function BetaGate({ provider, connected, children }: { provider: Provider; connected: boolean; children: React.ReactNode }) {
  const { canConnect, loading, access, setAccess } = useBetaAccess(provider, connected);
  if (canConnect) return <>{children}</>;
  if (loading) return null;
  return (
    <div className="basis-full">
      <WearableBetaInvite provider={provider} access={access} onRequested={setAccess} />
    </div>
  );
}
