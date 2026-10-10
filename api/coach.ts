// Fikko, the AI coach. A member sends a message; this gathers what they've logged
// in Fikko, asks Claude for a reply, checks it (see _lib/coachSafety.ts), returns
// it as plain text and saves both messages to coach_messages.
//
//   POST { message, tzOffset }  with "Authorization: Bearer <member session token>"
//
// Each member gets DAILY_AI_LIMIT AI replies per local day, shared with voice check-ins. Only this endpoint can
// write coach messages and usage (see migration 014), so the limit holds, and
// it's counted from coach_usage so clearing the chat doesn't reset it.

import Anthropic from "@anthropic-ai/sdk";
import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { blockedReply, checkAllowance, clampOffset, recordUse } from "./_lib/aiUsage.js";
import { recordCosts, type CallUsage } from "./_lib/aiCost.js";
import { consentError } from "./_lib/consent.js";
import { OPTIONS, withCors } from "./_lib/cors.js";
import { MODEL, SYSTEM_PROMPT, localNow, memberContext, pad } from "./_lib/coachContext.js";
import { FIXED_REPLIES, SAFETY_MODEL, classifyMessage, phraseScreen, reviewReply, type ScreenLabel } from "./_lib/coachSafety.js";

const MAX_MESSAGE_LENGTH = 2000;
/** Earlier messages sent back to Claude so it can follow the conversation. */
const HISTORY_MESSAGES = 20;

// ── Endpoint ───────────────────────────────────────────────────────────────

async function handlePOST(request: Request) {
  if (!supabaseReady()) return json({ error: "The coach isn't configured on the server." }, 503);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "The coach isn't set up yet. Please try again later." }, 503);

  const db = admin();
  const member = await memberFrom(request, db);
  if (!member) return json({ error: "Sign in again to continue." }, 401);
  const blocked = await consentError(db, member.id, ["health_data", "ai_processing"]);
  if (blocked) return blocked;

  const body = (await request.json().catch(() => ({}))) as { message?: unknown; tzOffset?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "Type a message first." }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ error: `Please keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.` }, 400);
  const tzOffset = clampOffset(body.tzOffset);

  const { used: count, limit: allowed, blocked: limited } = await checkAllowance(db, member.id, tzOffset);
  if (limited) return blockedReply(limited, allowed);

  const [context, historyRes] = await Promise.all([
    memberContext(db, member.id, tzOffset),
    db.from("coach_messages").select("role, content").eq("user_id", member.id)
      .order("created_at", { ascending: false }).limit(HISTORY_MESSAGES),
  ]);
  const local = localNow(tzOffset);
  // Weekly check-ins (api/coach-checkin.ts) are Fikko's own messages, so two can sit
  // side by side; neighbours from the same side are joined into one turn.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of (historyRes.data ?? []).reverse()) {
    const prev = history[history.length - 1];
    if (prev?.role === m.role) prev.content += `\n\n${m.content}`;
    else history.push({ role: m.role as "user" | "assistant", content: m.content as string });
  }
  // The API expects the conversation to open with the member. When it opens with Fikko
  // (a check-in the member is now replying to), say so rather than dropping it.
  if (history[0]?.role === "assistant") history.unshift({ role: "user", content: "(Opened the chat.)" });

  // Prompt caching: the prefix (system prompt, member data, earlier messages) is identical from
  // one message to the next, so cache it and pay about a tenth for those input tokens on a hit.
  // A breakpoint on the system data and one on the last earlier message cover both parts.
  // Prefixes under the model's minimum (4,096 tokens for Haiku 4.5) are quietly not cached.
  const cached = { type: "ephemeral" } as const;
  const last = history[history.length - 1];
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(0, -1),
    ...(last ? [{ role: last.role, content: [{ type: "text" as const, text: last.content as string, cache_control: cached }] }] : []),
    {
      role: "user",
      content: `[Member's local time: ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}]\n${message}`,
    },
  ];

  const client = new Anthropic();
  const previousReply = [...history].reverse().find((m) => m.role === "assistant")?.content as string | undefined;

  // Every reply passes the three checks in _lib/coachSafety.ts before it's shown or saved,
  // so replies arrive whole rather than streamed. The screen and the reply are prepared
  // side by side to save time; a reply to a message the screen flags is thrown away.
  let reply: string;
  let outcome: ScreenLabel | "review_failed" | "passed";
  // Every call is billed, including the safety checks and calls before a failure, so all are recorded.
  const calls: CallUsage[] = [];
  const track = (feature: CallUsage["feature"], model: string) => (usage: Anthropic.Usage) => calls.push({ feature, model, usage });
  try {
    const phrase = phraseScreen(message);
    if (phrase) {
      outcome = phrase;
      reply = FIXED_REPLIES[phrase];
    } else {
      const [label, final] = await Promise.all([
        classifyMessage(client, message, previousReply, track("coach_screen", SAFETY_MODEL)),
        client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "text", text: `The member's data in Fikko:\n\n${context}`, cache_control: cached },
          ],
          messages,
        }),
      ]);
      track("coach", MODEL)(final.usage);
      // Token counts only, no member data. cache_read > 0 means the prompt cache hit.
      const u = final.usage;
      console.log(`[coach] usage input=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} output=${u.output_tokens}`);
      const generated = final.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();

      if (label !== "in_scope") {
        outcome = label;
        reply = FIXED_REPLIES[label];
      } else if (!generated) {
        outcome = "review_failed";
        reply = final.stop_reason === "refusal" ? FIXED_REPLIES.off_topic : FIXED_REPLIES.review_failed;
      } else if (final.stop_reason === "max_tokens") {
        // A cut-off reply could stop mid-caveat; don't show half of one.
        outcome = "review_failed";
        reply = FIXED_REPLIES.review_failed;
      } else {
        const review = await reviewReply(client, message, generated, track("coach_review", SAFETY_MODEL));
        outcome = review.pass ? "passed" : "review_failed";
        reply = review.pass ? generated : FIXED_REPLIES.review_failed;
      }
    }
  } catch (err) {
    // Fail closed: if a check can't run, nothing generated is shown, saved or counted.
    console.error("[coach] failed:", err instanceof Error ? err.name : "unknown");
    await recordCosts(db, member.id, calls);
    const busy = err instanceof Anthropic.RateLimitError;
    return json({ error: busy ? "Fikko is busy right now. Please try again in a minute." : "Sorry, something went wrong on our side. Please try again." }, busy ? 429 : 502);
  }
  // Labels only, for auditing how often each check steps in. Never the message or reply.
  console.log(`[coach] outcome=${outcome}`);

  const at = Date.now();
  await recordUse(db, member.id);
  await recordCosts(db, member.id, calls);
  await db.from("coach_messages").insert([
    { user_id: member.id, role: "user", content: message, created_at: new Date(at).toISOString() },
    { user_id: member.id, role: "assistant", content: reply.slice(0, 8000), created_at: new Date(at + 1).toISOString() },
  ]);

  return new Response(reply, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Coach-Remaining": String(Math.max(0, allowed - count - 1)),
    },
  });
}

// The mobile apps call these from another origin (see _lib/cors.ts).
export const POST = withCors(handlePOST);
export { OPTIONS };
