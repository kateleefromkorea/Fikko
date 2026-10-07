// Adding Fikko to the home screen, which is how members "install" it until the
// App Store app arrives. Imported by main.tsx so the browser's install offer
// (Chrome and Edge on Android and desktop) is caught as soon as the page loads;
// it only fires once.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep it for our own button instead of the browser's mini bar.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type InstallPlatform = "ios" | "android" | "desktop";

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Already opened from the home screen. */
export function isInstalled() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True while the browser offers its own install dialog. */
export const canPromptInstall = () => deferred !== null;

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Opens the browser's install dialog. Resolves true if the member installed. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}
