// The member's daily AI credits (coach, voice and photo check-ins, and
// interaction checks share one allowance). Anything that spends one calls
// notifyAiUsed() once the server has answered, and every counter on screen
// (useAiCredits) re-reads the usage log.

export const AI_USED_EVENT = "fikko:ai-used";

export function notifyAiUsed() {
  window.dispatchEvent(new Event(AI_USED_EVENT));
}
