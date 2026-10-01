// Providers redirect here after the member approves (or declines) access.
// Checks the one-time state, swaps the code for tokens, runs a first sync,
// and sends the member back to their Profile with the outcome.

import { admin, providerFor, redirectUri, saveTokens, supabaseReady, syncMember } from "./_lib/devices.js";

// States older than this are refused, so an old link can't be replayed.
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

function back(request: Request, provider: string | null, outcome: "connected" | "declined" | "failed") {
  const to = new URL("/", request.url);
  if (provider) to.searchParams.set("device", provider);
  to.searchParams.set("result", outcome);
  return Response.redirect(to.toString(), 302);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!state || !supabaseReady()) return back(request, null, "failed");

  const db = admin();
  const { data: saved } = await db.from("oauth_states").select("user_id, code_verifier, created_at, provider").eq("state", state).maybeSingle();
  // One use only, whatever happens next.
  await db.from("oauth_states").delete().eq("state", state);
  const provider = providerFor(saved?.provider);
  if (!saved || !provider || Date.now() - new Date(saved.created_at).getTime() > STATE_MAX_AGE_MS) {
    return back(request, null, "failed");
  }
  if (params.get("error")) return back(request, provider.id, "declined");
  if (!code) return back(request, provider.id, "failed");

  try {
    await saveTokens(db, saved.user_id, provider, await provider.exchange(code, saved.code_verifier, redirectUri(request)));
  } catch {
    return back(request, provider.id, "failed");
  }

  // The connection stands even if the first sync hiccups; the nightly sync retries.
  try { await syncMember(db, saved.user_id, provider); } catch { /* recorded on the connection */ }
  return back(request, provider.id, "connected");
}
