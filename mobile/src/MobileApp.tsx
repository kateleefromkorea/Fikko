import { useCallback, useEffect, useRef } from "react";
import { App as NativeApp } from "@capacitor/app";
import PhoneApp from "@/phone/PhoneApp";
import { useAuthLinks } from "@mobile/lib/authLinks";

/** Where the website lives, for the Help, Privacy and Terms links. */
const SITE = import.meta.env.VITE_API_ORIGIN || "https://app.fikko.io";

/**
 * The iOS and Android app: the shared phone experience (src/phone/PhoneApp,
 * also what the website shows on phones), plus what only a native app has:
 * links that open the app, and Android's back button.
 */
export default function MobileApp() {
  useAuthLinks();

  // Android's back button steps back inside the app before leaving it.
  const back = useRef<() => boolean>(() => false);
  const onBackReady = useCallback((fn: () => boolean) => { back.current = fn; }, []);
  useEffect(() => {
    const listener = NativeApp.addListener("backButton", () => { if (!back.current()) void NativeApp.minimizeApp(); });
    return () => { void listener.then((l) => l.remove()); };
  }, []);

  return <PhoneApp viewPrefix="/app" siteOrigin={SITE} onBackReady={onBackReady} />;
}
