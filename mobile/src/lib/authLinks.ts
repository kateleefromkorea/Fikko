import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/auth/AuthProvider";
import { setAppAuthRedirect } from "@/auth/redirect";
import { readEmailLink, verifyEmailLink } from "@/auth/emailLink";
import { supabase } from "@/lib/supabase";

/**
 * The app's own link address. Registered with iOS (ios/App/App/Info.plist) and
 * Android (AndroidManifest.xml), and listed under Authentication → URL
 * Configuration → Redirect URLs in Supabase.
 */
export const AUTH_LINK = "io.fikko.app://auth/callback";

/**
 * Inside the iOS and Android apps, sign-in, confirmation and reset links
 * return to the app instead of the website, and Google's sign-in page opens
 * in the phone's browser (Google refuses to sign in inside an app's web view).
 */
export function setupAuthLinks() {
  if (!Capacitor.isNativePlatform()) return;
  setAppAuthRedirect({ url: AUTH_LINK, open: (url) => Browser.open({ url, presentationStyle: "popover" }) });
}

/** Finishes signing in when a link opens the app: on launch, or while it's running. */
export function useAuthLinks() {
  const { startRecovery } = useAuth();
  const recover = useRef(startRecovery);
  recover.current = startRecovery;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = async (url: string | undefined) => {
      if (!url?.startsWith(AUTH_LINK)) return;
      // Closes Google's page on iOS; Android closes it by switching back to the app.
      Browser.close().catch(() => {});

      // Supabase puts the session after "#" (or a code after "?").
      const link = new URL(url.replace(AUTH_LINK, "https://app.invalid/"));
      const params = new URLSearchParams(link.hash.slice(1));
      link.searchParams.forEach((value, key) => params.set(key, value));

      const code = params.get("code");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      // Fikko's emails carry a one-time code instead (see src/auth/emailLink.ts).
      const emailLink = readEmailLink(params);
      if (emailLink) { if (await verifyEmailLink(emailLink)) return; }
      else if (code) await supabase.auth.exchangeCodeForSession(code);
      else if (accessToken && refreshToken) await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      else return;

      if (params.get("type") === "recovery") recover.current();
    };

    void App.getLaunchUrl().then((launch) => handle(launch?.url));
    const listener = App.addListener("appUrlOpen", ({ url }) => void handle(url));
    return () => { void listener.then((l) => l.remove()); };
  }, []);
}
