import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { appAuthRedirect, authRedirectUrl } from "./redirect";
import { checkPageEmailLink, type EmailLinkError } from "./emailLink";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Emails the sign-up confirmation link again, for an account that isn't confirmed yet. */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  /** Signs in with the ID token from Google's own button (see GoogleButton). */
  signInWithGoogleToken: (token: string, nonce: string) => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** True after arriving from a password-reset email, until a new password is set. */
  recovering: boolean;
  /** Shows "choose a new password" after a reset link the app opened itself (the mobile app's links). */
  startRecovery: () => void;
  /** Why the email link the page was opened from didn't work, if it didn't. */
  linkError: EmailLinkError | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [linkError, setLinkError] = useState<EmailLinkError | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // The reset link signs the member in; they still need to choose a new password.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });

    // Opened from a link in one of Fikko's emails: check its code before
    // showing anything, so the sign-in screen doesn't flash up first.
    (appAuthRedirect() ? Promise.resolve(null) : checkPageEmailLink())
      .then((err) => { setLinkError(err); return supabase.auth.getSession(); })
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithPassword(email: string, password: string) {
    // The confirmation email links back here (or into the mobile app); see email-templates/.
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
    return { error: error?.message ?? null };
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirectUrl() } });
    return { error: error?.message ?? null };
  }

  async function signInWithGoogle() {
    const app = appAuthRedirect();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: !!app },
    });
    // In the mobile app, Google's page opens in the phone's browser instead.
    if (app && data.url) await app.open(data.url);
    return { error: error?.message ?? null };
  }

  async function signInWithGoogleToken(token: string, nonce: string) {
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
    return { error: error?.message ?? null };
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecovering(false);
    return { error: error?.message ?? null };
  }

  async function signOut() {
    setRecovering(false);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithPassword,
        signUpWithPassword,
        resendConfirmation,
        signInWithGoogle,
        signInWithGoogleToken,
        sendPasswordReset,
        updatePassword,
        recovering,
        startRecovery: () => setRecovering(true),
        linkError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
