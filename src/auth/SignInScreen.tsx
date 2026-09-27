import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

const fieldCls =
  "px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ring";

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
    <div
      className="relative overflow-hidden min-h-screen app-bg flex items-center justify-center px-4 pb-10"
      // The greeting is absolutely positioned, so reserve its height as top
      // padding: the card then centres in the space below it and can never
      // overlap the text, however short the screen.
      style={{ ["--welcome-size" as string]: "clamp(3rem, min(11vw, 15vh), 8rem)", paddingTop: "calc(var(--welcome-size) * 1.3 + 2.5rem)" }}
    >
      {/* Decorative handwritten greeting across the top. Sized by both viewport
          width and height so it stays on one line on phones and short laptops. */}
      <p
        className="pointer-events-none select-none absolute inset-x-0 top-0 pt-8 px-4 text-center leading-none whitespace-nowrap"
        style={{
          fontFamily: "'Dancing Script', cursive",
          fontWeight: 600,
          fontSize: "var(--welcome-size)",
          color: "rgba(255, 255, 255, 0.9)",
          textShadow: "0 4px 24px rgba(0, 0, 0, 0.25)",
        }}
      >
        Welcome to Fikko
      </p>

      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex justify-center mb-6">
          <span className="text-2xl font-bold tracking-wide text-foreground" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            FIKKO
          </span>
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
                className={fieldCls}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
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
              className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-gray-300 bg-white text-black hover:bg-gray-50 transition-all"
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
