// Types and helpers shared by the provider adapters and devices.ts. Kept
// separate so adapters don't import devices.ts, which imports them.

export interface TokenSet { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

/** One value for one metric on one day, as stored in biometric_entries. */
export interface Reading { metric: string; date: string; value: number }

export interface ProviderAdapter {
  id: "oura" | "google";
  name: string;
  /** True once the provider's client id and secret are set on the server. */
  ready(): boolean;
  authorizeUrl(redirectUri: string, state: string, challenge: string): string;
  exchange(code: string, verifier: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(accessToken: string): Promise<void>;
  /** Readings for the member's local days from `start` to `end` (inclusive). Throws AuthError on a rejected token. */
  fetchReadings(accessToken: string, start: string, end: string): Promise<Reading[]>;
}

export class AuthError extends Error {
  constructor(name: string) { super(`${name} no longer accepts this connection. Reconnect it in your Profile.`); }
}

/** Form-encoded token request, shared by providers that follow the OAuth 2.0 spec. */
export async function tokenRequest(url: string, params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return res.json() as Promise<TokenSet>;
}
