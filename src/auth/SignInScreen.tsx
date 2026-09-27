import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { useAuth } from "./AuthProvider";
import TestimonialLoop from "./TestimonialLoop";
import { SHOW_TESTIMONIALS } from "./testimonials";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default function SignInScreen() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } =
      mode === "signin" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else if (mode === "signup") {
      setCheckEmail(true);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) setError(error);
  }

  return (
    <div className="hero-wash flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6 sm:px-8">
        <span className="text-lg font-bold tracking-wide">FIKKO</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-10 max-w-md text-center">
          <h1 className="text-4xl leading-[1.1] font-semibold sm:text-5xl">
            {mode === "signin" ? "Welcome back" : "Start with Fikko"}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Water, meds, food, exercise, sleep and mood in one daily check-in. No ads.
          </p>
        </div>

        <Card className="w-full max-w-sm gap-6 shadow-xl shadow-teal/10 [--card-spacing:--spacing(8)]">
          {checkEmail ? (
            <CardContent className="flex flex-col items-center text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                <MailCheck className="size-6" />
              </span>
              <p className="mt-4 font-semibold">Check your inbox</p>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span> to finish
                signing up.
              </p>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  {mode === "signin" ? "Sign in" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "signin" ? "Use your email and password." : "It's free, and takes a few seconds."}
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
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
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
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" disabled={submitting} className="h-10 w-full">
                    {submitting && <Loader2 className="animate-spin" />}
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                </form>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  or
                  <Separator className="flex-1" />
                </div>

                <Button variant="outline" onClick={handleGoogle} className="h-10 w-full">
                  <GoogleMark />
                  Continue with Google
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  {mode === "signin" ? "New to Fikko?" : "Already have an account?"}{" "}
                  <Button
                    variant="link"
                    onClick={() => {
                      setMode(mode === "signin" ? "signup" : "signin");
                      setError(null);
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
      </main>

      {SHOW_TESTIMONIALS && <TestimonialLoop />}
    </div>
  );
}
