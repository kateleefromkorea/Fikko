import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { setHaptics } from "@/phone/haptics";

/**
 * Inside the iOS and Android apps, the phone experience's haptics (see
 * src/phone/haptics.ts) use the native taptic engine instead of the
 * browser's vibration.
 */
export function setupNativeHaptics() {
  if (!Capacitor.isNativePlatform()) return;
  // Haptics are a nicety: never let a failure reach the member.
  const run = (fn: () => Promise<void>) => () => { fn().catch(() => {}); };
  setHaptics({
    tap: run(() => Haptics.impact({ style: ImpactStyle.Light })),
    logged: run(() => Haptics.impact({ style: ImpactStyle.Medium })),
    success: run(() => Haptics.notification({ type: NotificationType.Success })),
  });
}
