import type { OnboardingState } from "./useOnboardingState";

// Connecting a device leaves the page for the provider's sign-in, which would
// lose every answer so far. The answers are parked in this tab's session
// storage first and picked up again on the way back.
const DRAFT_KEY = "fikko-onboarding-draft";

export interface OnboardingDraft { userId: string; step: number; state: OnboardingState }

export function saveDraft(draft: OnboardingDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage blocked: answers are re-asked */ }
}

/** The parked answers for this member, if any. */
export function readDraft(userId: string | null): OnboardingDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as OnboardingDraft | null;
    return d && d.userId === userId && d.state ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}

/** Whether answers are parked in this tab, for checks made before the member is known. */
export function hasDraft() {
  try { return sessionStorage.getItem(DRAFT_KEY) !== null; } catch { return false; }
}
