// Records what each call to Anthropic's API cost, in ai_costs (migration 024), so
// AI spend per member per day shows on /admin instead of only on the monthly bill.
// Token counts only: never the message, photo or reply.
//
// Prices are US$ per million tokens from Anthropic's published pricing; update
// PRICES if they change. A model missing here is recorded with its tokens and a
// cost of 0, and a warning is logged.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AiFeature = "coach" | "coach_screen" | "coach_review" | "voice" | "photo" | "interactions";

const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Haiku 4.5: US$1 input, US$5 output; cache reads 0.1x input, 5-minute cache writes 1.25x input.
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export interface CallUsage { feature: AiFeature; model: string; usage: Anthropic.Usage }

export function costOf(model: string, u: Anthropic.Usage) {
  const p = PRICES[model];
  if (!p) return 0;
  return (
    u.input_tokens * p.input +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    u.output_tokens * p.output
  ) / 1_000_000;
}

/**
 * Saves one row per call. Never throws: a failed write is logged and the member's
 * request carries on, because losing a cost row is better than failing their request.
 */
export async function recordCosts(db: SupabaseClient, userId: string, calls: CallUsage[]) {
  if (!calls.length) return;
  for (const c of calls) if (!PRICES[c.model]) console.warn(`[ai-cost] no price for model ${c.model}; recorded as 0`);
  const { error } = await db.from("ai_costs").insert(calls.map((c) => ({
    user_id: userId,
    feature: c.feature,
    model: c.model,
    input_tokens: c.usage.input_tokens,
    cache_read_tokens: c.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: c.usage.cache_creation_input_tokens ?? 0,
    output_tokens: c.usage.output_tokens,
    cost_usd: costOf(c.model, c.usage),
  })));
  if (error) console.error("[ai-cost] couldn't save:", error.code ?? error.message);
}
