import { haptics } from "@mobile/lib/haptics";

/** Distance (px) a finger must travel down before the sheet follows it, so taps and scrolls aren't mistaken for drags. */
const START_PX = 8;
/** Released past this share of the sheet's height (or this many px, whichever is less), it closes. */
const CLOSE_SHARE = 0.25;
const CLOSE_PX = 140;
/** A quick flick closes it whatever the distance (px per ms). */
const FLICK_SPEED = 0.6;

const SHEET = '[data-slot="dialog-content"]';

/**
 * Swipe down to close any bottom sheet, as on iOS. Every dialog in the app is
 * a sheet (see mobile.css), so this listens once on the document instead of
 * on each one. A drag only starts while the sheet is scrolled to its top, so
 * scrolling a long sheet still works. Closing goes through the dialog's own
 * Escape handling, so a dialog that refuses Escape (the food search with its
 * options open) springs back instead.
 */
export function setupSwipeToDismiss() {
  let sheet: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let dy = 0;
  let dragging = false;
  let pastPoint = false;
  // Recent positions, for the release speed.
  let samples: { y: number; t: number }[] = [];

  const reset = () => { sheet = null; overlay = null; dragging = false; pastPoint = false; dy = 0; samples = []; };

  /** True when the touch is inside something that has scrolled away from its top. */
  function insideScrolled(target: Element, root: HTMLElement) {
    for (let el: Element | null = target; el && el !== root.parentElement; el = el.parentElement) {
      if (el.scrollTop > 0) return true;
    }
    return false;
  }

  function closeDistance(el: HTMLElement) {
    return Math.min(CLOSE_PX, el.offsetHeight * CLOSE_SHARE);
  }

  function setOffset(el: HTMLElement, offset: number, animate: boolean) {
    el.style.transition = animate ? "transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)" : "none";
    el.style.transform = `translateY(${offset}px)`;
    if (overlay) {
      overlay.style.transition = animate ? "opacity 220ms ease" : "none";
      overlay.style.opacity = String(Math.max(0.2, 1 - offset / el.offsetHeight));
    }
  }

  function clear(el: HTMLElement, ov: HTMLElement | null) {
    el.style.transition = "";
    el.style.transform = "";
    if (ov) { ov.style.transition = ""; ov.style.opacity = ""; }
  }

  document.addEventListener("touchstart", (e) => {
    reset();
    const target = e.target as Element | null;
    const found = target?.closest<HTMLElement>(SHEET);
    // Full-screen pages (search) opt out: they close with their own Cancel.
    if (!found || found.dataset.noSwipe !== undefined || e.touches.length > 1 || insideScrolled(target!, found)) return;
    sheet = found;
    const prev = found.previousElementSibling;
    overlay = prev instanceof HTMLElement && prev.dataset.slot === "dialog-overlay" ? prev : null;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    samples = [{ y: startY, t: e.timeStamp }];
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!sheet) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (!dragging) {
      const down = y - startY;
      // Only a mostly-vertical pull downwards starts a drag; anything else is left to scroll or swipe.
      if (down < START_PX || Math.abs(x - startX) > down) {
        if (Math.abs(x - startX) > START_PX || startY - y > START_PX) reset();
        return;
      }
      dragging = true;
      startY = y;
    }
    e.preventDefault();
    dy = Math.max(0, y - startY);
    samples.push({ y, t: e.timeStamp });
    if (samples.length > 5) samples.shift();
    setOffset(sheet, dy, false);
    // A light tick as the pull crosses the point where letting go closes it.
    const past = dy > closeDistance(sheet);
    if (past && !pastPoint) haptics.tap();
    pastPoint = past;
  }, { passive: false });

  const end = () => {
    const el = sheet;
    const ov = overlay;
    if (!el || !dragging) { reset(); return; }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const speed = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    const close = dy > closeDistance(el) || speed > FLICK_SPEED;
    reset();

    if (!close) {
      setOffset(el, 0, true);
      window.setTimeout(() => clear(el, ov), 240);
      return;
    }
    // Slide it the rest of the way, then let the dialog close itself.
    setOffset(el, el.offsetHeight, true);
    window.setTimeout(() => {
      el.dataset.swiped = "";
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      // Still open: the dialog said no (or isn't listening). Bring it back.
      window.setTimeout(() => {
        if (el.isConnected && el.dataset.state === "open") {
          delete el.dataset.swiped;
          setOffset(el, 0, true);
          window.setTimeout(() => clear(el, ov), 240);
        }
      }, 80);
    }, 200);
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
}
