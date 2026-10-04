import { useEffect, useRef, useState } from "react";
import { appAuthRedirect } from "./redirect";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";

// "Continue with Google" on the website, using Google's own sign-in button
// (Google Identity Services). Google's account picker then says "to continue
// to fikko.io" rather than showing the Supabase project's address, and the
// token it returns is handed to Supabase, which signs the member in as before.
//
// Falls back to the redirect sign-in (Google → Supabase → back here) in the
// mobile app, where Google's web button doesn't work, when VITE_GOOGLE_CLIENT_ID
// isn't set, or when Google's script can't load.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT_URL = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    nonce: string;
    use_fedcm_for_button?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

let scriptLoad: Promise<GoogleId> | null = null;
function loadGoogle(): Promise<GoogleId> {
  scriptLoad ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in unavailable")));
    s.onerror = () => { scriptLoad = null; reject(new Error("Google sign-in unavailable")); };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

/** A random nonce, and its SHA-256 for Google. Supabase checks the token carries the hash of the raw one. */
async function makeNonce() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

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

interface Props {
  mode: "signin" | "signup";
  onError: (message: string) => void;
}

export default function GoogleButton({ mode, onError }: Props) {
  const { signInWithGoogle, signInWithGoogleToken } = useAuth();
  const useGoogleButton = !!CLIENT_ID && !appAuthRedirect();
  const [failed, setFailed] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  // Read through a ref so a re-render doesn't redraw Google's button.
  const handlers = useRef({ signInWithGoogleToken, onError });
  handlers.current = { signInWithGoogleToken, onError };

  useEffect(() => {
    if (!useGoogleButton || failed) return;
    let cancelled = false;
    (async () => {
      try {
        const [google, nonce] = await Promise.all([loadGoogle(), makeNonce()]);
        if (cancelled || !slot.current) return;
        google.initialize({
          client_id: CLIENT_ID!,
          nonce: nonce.hashed,
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            const { error } = await handlers.current.signInWithGoogleToken(credential, nonce.raw);
            if (error) handlers.current.onError(error);
          },
        });
        google.renderButton(slot.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: mode === "signup" ? "signup_with" : "continue_with",
          logo_alignment: "center",
          width: Math.min(400, Math.max(200, slot.current.offsetWidth)),
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [useGoogleButton, failed, mode]);

  if (useGoogleButton && !failed) {
    // Google draws its button into this box; the height stops the form jumping while it loads.
    return <div ref={slot} className="flex h-10 w-full justify-center [color-scheme:light]" />;
  }

  return (
    <Button
      variant="outline"
      onClick={async () => { const { error } = await signInWithGoogle(); if (error) onError(error); }}
      className="h-10 w-full"
    >
      <GoogleMark />
      Continue with Google
    </Button>
  );
}
