// Turns an error into something a member can act on. Fikko's own server
// messages are written for members and pass through; a lost connection or a
// technical message from a library (which means nothing to anyone) doesn't.

const OFFLINE = /failed to fetch|load failed|networkerror|network request failed|network error|the internet connection appears to be offline|err_internet_disconnected/i;
const TECHNICAL = /violates|jwt|pgrst|duplicate key|syntax error|unexpected token|is not valid json|undefined|null|status code|\b[45]\d\d\b|fetch|typeerror|cannot read/i;

export const OFFLINE_MESSAGE = "You seem to be offline. Check your connection and try again.";

/** A message for `err` that's safe to show, or `fallback` when it isn't. */
export function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return fallback;
  if (OFFLINE.test(message) || (typeof navigator !== "undefined" && navigator.onLine === false)) return OFFLINE_MESSAGE;
  if (TECHNICAL.test(message)) return fallback;
  return message;
}
