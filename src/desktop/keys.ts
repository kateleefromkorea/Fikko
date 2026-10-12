/** The modifier key people press for shortcuts: ⌘ on Apple computers, Ctrl elsewhere. */
export const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/** True while focus is somewhere typing or arrow keys belong to (a field, a menu, a slider). */
export function typingIn(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="listbox"], [role="tablist"], [role="radiogroup"], [role="slider"]',
  );
}
