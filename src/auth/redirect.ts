// Where sign-in, confirmation and password-reset links send people back to.
// The website leaves this alone: links return to the page's own address, and
// Google sign-in replaces the page. The mobile app (mobile/src/lib/authLinks.ts)
// sets its own link address and opens Google's page in the phone's browser.

interface AppAuthRedirect {
  /** The app's link address, e.g. "io.fikko.app://auth/callback". */
  url: string;
  /** Opens Google's sign-in page outside the app. */
  open: (url: string) => Promise<void>;
}

let app: AppAuthRedirect | null = null;

export function setAppAuthRedirect(redirect: AppAuthRedirect) {
  app = redirect;
}

/** The address links return to. */
export const authRedirectUrl = () => app?.url ?? window.location.origin;

/** Set only in the mobile app. */
export const appAuthRedirect = () => app;
