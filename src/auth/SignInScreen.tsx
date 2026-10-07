import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { useAuth } from "./AuthProvider";
import GoogleButton from "./GoogleButton";
import { DELETION_GRACE_DAYS } from "../lib/account";
import TestimonialLoop from "./TestimonialLoop";
import { SHOW_TESTIMONIALS } from "./testimonials";
import { Button } from "@/components/ui/button";
import { FoundingPlacesLeft } from "../components/FoundingMember";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/** Seconds between "send again" taps; Supabase also limits how often one address can be emailed. */
const RESEND_WAIT = 60;

/** Links can open the sign-up form directly with ?mode=signup (the marketing
 *  site's "Start" buttons do); anything else opens sign-in as before. */
function initialMode(): "signin" | "signup" {
  return new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
}

export default function SignInScreen() {
  const { signInWithPassword, signUpWithPassword, resendConfirmation, sendPasswordReset, linkError } = useAuth();
  // An expired reset link lands on "reset" with the reason, ready to ask for a new one.
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(() => (linkError?.type === "recovery" ? "reset" : initialMode()));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError?.message ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  // "Send the link again": when it can next be tapped, the seconds left, and how the last try went.
  // Counted from the clock, so it stays right after a trip to the email app (where timers pause).
  const [resendAt, setResendAt] = useState(0);
  const [wait, setWait] = useState(0);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<"sent" | string | null>(null);
  // Signing in before confirming the email offers the link again too.
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setWait(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [resendAt]);

  const startWait = () => setResendAt(Date.now() + RESEND_WAIT * 1000);

  async function resend() {
    if (wait > 0 || resending) return;
    setResending(true);
    setResent(null);
    const { error } = mode === "reset" ? await sendPasswordReset(email) : await resendConfirmation(email);
    setResending(false);
    setResent(error ?? "sent");
    startWait();
  }

  async function resendFromSignIn() {
    const { error } = await resendConfirmation(email);
    if (error) return setError(error);
    setMode("signup");
    setUnconfirmed(false);
    setError(null);
    setResent("sent");
    startWait();
    setCheckEmail(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : mode === "signup"
          ? await signUpWithPassword(email, password)
          : await sendPasswordReset(email);
    setSubmitting(false);
    setUnconfirmed(false);
    if (error) {
      setError(error);
      if (mode === "signin" && /not confirmed/i.test(error)) setUnconfirmed(true);
    } else if (mode !== "signin") {
      setResent(null);
      startWait();
      setCheckEmail(true);
    }
  }

  return (
    <div className="hero-wash flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-screen-2xl items-center px-4 sm:px-6">
        <span className="text-lg font-bold tracking-wide">FIKKO</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-10 max-w-md text-center">
          <h1 className="text-4xl leading-[1.1] font-semibold sm:text-5xl">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Start with Fikko" : "Forgot your password?"}
          </h1>
          <p className="mt-4 font-tagline text-lg leading-relaxed text-balance text-muted-foreground">
            Your entire day, simplified into one check-in. Completely ad-free.
          </p>
          {mode === "signup" && !checkEmail && (
            <FoundingPlacesLeft className="mt-4 text-sm text-pretty text-muted-foreground" />
          )}
        </div>

        <Card className="w-full max-w-sm gap-6 shadow-xl shadow-teal/10 [--card-spacing:--spacing(8)]">
          {checkEmail ? (
            <CardContent className="flex flex-col items-center text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary-ink" aria-hidden="true">
                <MailCheck className="size-6" />
              </span>
              <p className="mt-4 font-semibold">Check your inbox</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "reset" ? "We sent a password reset link to " : "We sent a confirmation link to "}
                <span className="font-medium text-foreground">{email}</span>
                {mode === "reset" ? ". It may take a minute to arrive." : " to finish signing up."}
              </p>
              {mode === "signup" && (
                // Supabase sends nothing to an email that already has an account (including one
                // deleted in the last DELETION_GRACE_DAYS days) and, for privacy, doesn't say so.
                <p className="mt-2 text-sm text-muted-foreground">
                  Already have a Fikko account with this email? No email will arrive.{" "}
                  <Button
                    variant="link"
                    onClick={() => { setCheckEmail(false); setMode("signin"); setError(null); setResent(null); }}
                    className="h-auto p-0 text-sm"
                  >
                    Sign in instead
                  </Button>
                  . If you deleted your account in the last {DELETION_GRACE_DAYS} days, signing in lets you restore it.
                </p>
              )}
              <div className="mt-5 w-full space-y-2 border-t pt-5">
                <p className="text-sm text-muted-foreground">Didn&apos;t get it? Check your spam folder, or</p>
                <Button variant="outline" onClick={() => void resend()} disabled={wait > 0 || resending} className="h-9 w-full">
                  {resending && <Loader2 className="animate-spin" />}
                  {wait > 0 ? `Send the link again in ${wait}s` : "Send the link again"}
                </Button>
                {resent === "sent" && (
                  <p role="status" className="text-sm text-primary-ink">A new link is on its way. Use the newest email.</p>
                )}
                {resent && resent !== "sent" && <p role="alert" className="text-sm text-destructive">{resent}</p>}
              </div>
              <Button
                variant="link"
                onClick={() => { setCheckEmail(false); setError(null); setResent(null); }}
                className="mt-3 h-auto p-0"
              >
                Wrong email? Use a different one
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password"}
                </CardTitle>
                <CardDescription>
                  {mode === "signin"
                    ? "Use your email and password."
                    : mode === "signup"
                      ? "It's free, and takes a few seconds."
                      : "We'll email you a link to choose a new one."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  {mode !== "reset" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => { setMode("reset"); setError(null); }}
                          className="h-auto p-0 text-xs text-muted-foreground"
                        >
                          Forgot password?
                        </Button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  )}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {unconfirmed && (
                    <Button type="button" variant="link" onClick={() => void resendFromSignIn()} className="h-auto p-0 text-sm">
                      Send the confirmation link again
                    </Button>
                  )}
                  <Button type="submit" disabled={submitting} className="h-10 w-full">
                    {submitting && <Loader2 className="animate-spin" />}
                    {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                  </Button>
                </form>

                {mode !== "reset" && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Separator className="flex-1" />
                      or
                      <Separator className="flex-1" />
                    </div>

                    <GoogleButton mode={mode} onError={setError} />
                  </>
                )}

                <p className="text-center text-sm text-muted-foreground">
                  {mode === "signin" ? "New to Fikko?" : mode === "signup" ? "Already have an account?" : "Remembered it?"}{" "}
                  <Button
                    variant="link"
                    onClick={() => {
                      setMode(mode === "signin" ? "signup" : "signin");
                      setError(null);
                      setUnconfirmed(false);
                    }}
                    className="h-auto p-0"
                  >
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </Button>
                </p>
              </CardContent>
            </>
          )}
        </Card>
        <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <a href="/terms.html" className="underline underline-offset-2 hover:text-foreground">Terms</a> and{" "}
          <a href="/privacy.html" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a>.
        </p>
      </main>

      {SHOW_TESTIMONIALS && <TestimonialLoop />}
    </div>
  );
}
