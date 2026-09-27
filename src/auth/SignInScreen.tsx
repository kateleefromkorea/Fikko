import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

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
    <div className="min-h-screen app-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold text-primary-foreground bg-primary">
            F
          </div>
          <span className="text-xl font-extrabold text-foreground">Fikko</span>
        </div>

        {checkEmail ? (
          <p className="text-sm text-center text-muted-foreground">
            Check <span className="font-semibold text-foreground">{email}</span> for a confirmation link to finish
            signing up.
          </p>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-1 px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="flex items-center gap-2 my-4 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={handleGoogle}
              className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-border bg-background"
            >
              Continue with Google
            </button>

            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="mt-4 w-full text-xs text-center text-muted-foreground"
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
