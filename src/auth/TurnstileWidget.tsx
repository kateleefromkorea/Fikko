import { useEffect, useRef, useState } from "react";

/** Cloudflare Turnstile site key. Unset = no bot check (keep Supabase's CAPTCHA setting off too). */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptReady: Promise<void> | null = null;

function loadScript() {
  scriptReady ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptReady = null; reject(new Error("Turnstile failed to load")); };
    document.head.appendChild(s);
  });
  return scriptReady;
}

/**
 * Cloudflare's bot check. Calls onToken with a one-use token (or null when it expires or fails).
 * Bump `resetKey` after each sign-in / sign-up / reset attempt to get a fresh token.
 */
export default function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const cb = useRef(onToken);
  cb.current = onToken;
  // Blocked (ad blocker, stale service worker) or errored: say so, rather than leave a grey button.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t: string) => { setFailed(false); cb.current(t); },
          "expired-callback": () => cb.current(null),
          "error-callback": () => { setFailed(true); cb.current(null); },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); cb.current(null); });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
      cb.current(null);
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="space-y-2">
      <div ref={box} className="flex justify-center" />
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          The security check didn&apos;t load. Refresh the page, or turn off ad blockers for Fikko, then try again.
        </p>
      )}
    </div>
  );
}
