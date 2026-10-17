// Sends crashes in the app to Sentry so the owner hears about them before
// members do. Off unless VITE_SENTRY_DSN is set. Plain fetch to Sentry's
// envelope endpoint instead of the SDK: smaller download, and nothing is
// collected that isn't listed here.
//
// What is sent: the error's name, a scrubbed message, a trimmed stack and the
// page path with ids removed. Never who the member is, what they logged, their
// email, or any breadcrumbs, cookies, headers or session replay.
// The server counterpart is api/_lib/errorReport.ts.

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const parsed = (() => {
  try {
    if (!DSN) return null;
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
    .slice(0, max);
}

/** The current page without ids, query string or hash. */
const pagePath = () => scrub(window.location.pathname.replace(/\/[0-9a-f-]{20,}/gi, "/[id]"), 100);

/** Stops one broken page from sending thousands of reports. */
const MAX_PER_PAGE = 10;
let sent = 0;
const seen = new Set<string>();

/** Reports an error. Never throws. */
export function reportError(err: unknown, source = "app") {
  if (!parsed || sent >= MAX_PER_PAGE) return;
  try {
    const name = err instanceof Error ? err.name : "Error";
    const message = scrub(err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error");
    // Lost connections and stale pages after a deploy aren't bugs.
    if (/failed to fetch|load failed|networkerror|importing a module script failed|error loading dynamically imported module/i.test(message)) return;
    const key = `${name}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    const eventId = crypto.randomUUID().replace(/-/g, "");
    const stack = err instanceof Error && err.stack ? scrub(err.stack.split("\n").slice(0, 8).join("\n"), 1500) : undefined;
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: "error",
      environment: "production",
      logger: "fikko-app",
      transaction: pagePath(),
      tags: { source },
      exception: { values: [{ type: name, value: message }] },
      extra: { stack },
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    void fetch(`https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.key}&sentry_version=7`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never break the app */
  }
}

/** Starts catching errors nothing else handles. Call once at startup. */
export function startErrorReporting() {
  if (!parsed) return;
  window.addEventListener("error", (e) => reportError(e.error ?? e.message, "window"));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"));
}
