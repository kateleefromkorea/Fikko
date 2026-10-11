import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * The phone's taptic feedback, used sparingly so it keeps its meaning:
 * - `tap`: a light tick for opening the capture button or a sheet snapping past its close point.
 * - `logged`: a firmer tick when a one-tap log saves.
 * - `success`: the "done" pattern when a log finishes a habit or the whole day.
 * Only inside the iOS and Android apps; in a browser these do nothing.
 */
const native = Capacitor.isNativePlatform();

function run(fn: () => Promise<void>) {
  if (!native) return;
  // Haptics are a nicety: never let a failure reach the member.
  fn().catch(() => {});
}

export const haptics = {
  tap: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  logged: () => run(() => Haptics.impact({ style: ImpactStyle.Medium })),
  success: () => run(() => Haptics.notification({ type: NotificationType.Success })),
};
