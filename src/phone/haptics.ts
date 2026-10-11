/**
 * Taptic feedback for the phone experience, used sparingly so it keeps its meaning:
 * - `tap`: a light tick for opening the capture button or a sheet snapping past its close point.
 * - `logged`: a firmer tick when a one-tap log saves.
 * - `success`: the "done" pattern when a log finishes a habit or the whole day.
 *
 * In a browser this is a short vibration where the browser allows it (Android
 * Chrome; iPhone Safari doesn't). The iOS and Android apps swap in the native
 * taptic engine with `setHaptics` (see mobile/src/lib/haptics.ts).
 */
export interface Haptics {
  tap: () => void;
  logged: () => void;
  success: () => void;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not allowed here: no feedback, nothing else changes.
  }
}

let impl: Haptics = {
  tap: () => vibrate(8),
  logged: () => vibrate(14),
  success: () => vibrate([12, 60, 18]),
};

export const haptics: Haptics = {
  tap: () => impl.tap(),
  logged: () => impl.logged(),
  success: () => impl.success(),
};

/** Replaces the browser vibration with a native implementation. */
export function setHaptics(next: Haptics) {
  impl = next;
}
