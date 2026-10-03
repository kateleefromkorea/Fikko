// Anonymous page-view counter (see api/track.ts). No cookies or storage;
// skipped in development so local testing doesn't count.
export function trackView(path: string) {
  if (!import.meta.env.PROD) return;
  const body = JSON.stringify({ site: "app", path, ref: document.referrer, host: location.hostname });
  try {
    navigator.sendBeacon("/api/track", body);
  } catch {
    // Stats are best-effort; never let them break the app.
  }
}
