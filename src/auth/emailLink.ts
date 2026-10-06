import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Links in Fikko's emails (reset password, confirm sign-up) point at Fikko's
// own address with a one-time code, e.g. https://fikko.io/?token_hash=…&type=recovery,
// instead of at the database's own address. The app checks the code here. See
// email-templates/ for the emails themselves.

export interface EmailLink {
  tokenHash: string;
  type: EmailOtpType;
}

export interface EmailLinkError {
  type: EmailOtpType;
  message: string;
}

/** The one-time code in a link's query, if there is one. */
export function readEmailLink(params: URLSearchParams): EmailLink | null {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  return tokenHash && type ? { tokenHash, type } : null;
}

/**
 * Checks the code and signs the member in. A reset link then shows "choose a
 * new password" (Supabase reports it as PASSWORD_RECOVERY). Returns why it
 * failed, in words for the member, or null.
 */
export async function verifyEmailLink({ tokenHash, type }: EmailLink): Promise<EmailLinkError | null> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (!error) return null;
  return {
    type,
    message: type === "recovery"
      ? "That reset link has expired or was already used. Enter your email to get a new one."
      : "That link has expired or was already used. Sign in, or ask for a new confirmation link.",
  };
}

/** Takes the code out of the address bar, so a reload or a shared URL can't reuse it. */
export function clearEmailLinkFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

let pageLinkCheck: Promise<EmailLinkError | null> | null = null;

/**
 * Checks the link the page was opened from, once per page load: takes the
 * code out of the address bar and verifies it. Later calls get the same
 * answer (React runs start-up effects twice in development). Resolves to null
 * when there was no link or it worked.
 */
export function checkPageEmailLink(): Promise<EmailLinkError | null> {
  if (!pageLinkCheck) {
    const link = readEmailLink(new URLSearchParams(window.location.search));
    if (link) clearEmailLinkFromUrl();
    pageLinkCheck = link ? verifyEmailLink(link) : Promise.resolve(null);
  }
  return pageLinkCheck;
}
