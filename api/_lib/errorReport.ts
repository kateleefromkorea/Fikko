// Sends server errors to Sentry so crashes reach the owner before members report
// them. Off unless SENTRY_DSN is set in Vercel. Plain fetch to Sentry's envelope
// endpoint, no SDK, so nothing else about a request leaks.
//
// What is sent: the error's name, a scrubbed message, a trimmed stack, which
// endpoint failed and the HTTP status. Never request bodies, headers, tokens,
// member ids, emails or any health data. See `scrub` for what is removed.
// The client counterpart is src/lib/errorReport.ts.

const DSN = process.env.SENTRY_DSN ?? "";
const parsed = (() => {
  try {
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\/+/, "");
    return u.username && projectId ? { key: u.username, host: u.host, projectId } : null;
  } catch {
    return null;
  }
})();

/** Takes anything that could identify a member out of a string. */
export function scrub(text: string, max = 300) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[token]")
    .replace(/\b(?:sk|sb|pri|pdl|live|test)_[\w-]{8,}/gi, "[key]")
    .slice(0, max);
}

const recent = new Map<string, number>();

/** Reports an error from `where` (for example "/api/email"). Never throws and never waits long. */
export async function reportServerError(err: unknown, where: string, status?: number) {
  if (!parsed) return;
  try {
    const name = err instanceof Error ? err.name : "Error";
    const message = scrub(err instanceof Error ? err.message : typeof err === "string" ? err : status ? `HTTP ${status}` : "unknown error");
    const key = `${where}|${name}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return; // the same error again within a minute
    recent.set(key, now);
    if (recent.size > 200) recent.clear();

    const eventId = crypto.randomUUID().replace(/-/g, "");
    const stack = err instanceof Error && err.stack ? scrub(err.stack.split("\n").slice(0, 8).join("\n"), 1500) : undefined;
    const event = {
      event_id: eventId,
      timestamp: now / 1000,
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV ?? "production",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      logger: "fikko-api",
      transaction: where,
      tags: { endpoint: where, ...(status ? { status: String(status) } : {}) },
      exception: { values: [{ type: name, value: message }] },
      extra: { stack },
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    await fetch(`https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.key}&sentry_version=7`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* reporting must never break a request */
  }
}
