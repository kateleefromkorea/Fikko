// Fikko's own emails, in one function (Vercel's Hobby plan allows 12 per
// deployment).
//
//   POST { action: "founding-welcome" }, from the app when a new founding
//     member first sees their welcome: emails them once (migration 030 records
//     when it went out). Does nothing for members without a place.
//     Carries "Authorization: Bearer <member session token>".
//   GET, from the hourly cron: sends reminder emails (migration 031, plan in
//     _lib/reminders.ts). Vercel sends "Authorization: Bearer <CRON_SECRET>",
//     which is checked before anything runs.
//   GET ?unsubscribe=<token>: a page with one button to turn reminders off.
//     A plain link doesn't do it, because email scanners open links.
//   POST ?unsubscribe=<token>: turns reminders off. Used by that button and by
//     mail apps' own one-click Unsubscribe (the List-Unsubscribe header).

import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { emailReady, layout, sendEmail } from "./_lib/email.js";
import { decide, type Candidate, type ReminderKind } from "./_lib/reminders.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

/** Where links in emails point. The cron's own URL may be a deployment address, so it's set here. */
const APP_URL = (process.env.APP_URL ?? "https://app.fikko.io").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Resend allows about 2 requests a second on its standard plans. */
const SEND_GAP_MS = 600;

// ── Founding-member welcome ────────────────────────────────────────────────

async function foundingWelcome(request: Request) {
  if (!supabaseReady()) return json({ error: "Not configured." }, 503);
  const db = admin();
  const member = await memberFrom(request, db);
  if (!member?.email) return json({ error: "Your session has expired. Sign in again and retry." }, 401);
  if (!emailReady()) return json({ sent: false, reason: "email-not-configured" });

  const { data: place } = await db.from("founding_members").select("place, welcome_sent_at").eq("user_id", member.id).maybeSingle();
  if (!place || place.welcome_sent_at) return json({ sent: false });

  // Claim the send first, so two open tabs can't both send it.
  const { data: claimed } = await db.from("founding_members")
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq("user_id", member.id).is("welcome_sent_at", null).select("user_id");
  if (!claimed?.length) return json({ sent: false });

  const { data: profile } = await db.from("profiles").select("name").eq("user_id", member.id).maybeSingle();
  const first = (profile?.name ?? "").trim().split(/\s+/)[0];
  const paragraphs = [
    `${first ? `${first}, you're` : "You're"} founding member #${place.place} of 100. Thank you for joining Fikko this early.`,
    "Fikko is free for everyone while we launch. When paid plans arrive, you'll get Fikko Premium free for 12 months, starting the day they launch. Nothing to do now, and we'll never charge you without your agreement.",
    "About a month before your free year ends, we'll email you to say when it ends and what Premium costs if you'd like to keep it.",
    "Questions or ideas? Just reply to this email. Founding members shape what we build next.",
  ];
  try {
    await sendEmail({
      to: member.email,
      subject: `You're Fikko founding member #${place.place}`,
      html: layout({
        title: "Welcome, founding member",
        heading: "Welcome, founding member",
        paragraphs,
        button: { label: "Open Fikko", url: APP_URL },
        footnote: `The full details are in our Terms: ${APP_URL}/terms.html#founding-members`,
      }),
      text: `${paragraphs.join("\n\n")}\n\nOpen Fikko: ${APP_URL}\nTerms: ${APP_URL}/terms.html#founding-members\n\nFikko · PipePiper, Seoul · hello@fikko.io`,
    });
  } catch (err) {
    console.error("Fikko couldn't send the founding welcome:", err);
    // Let a later visit try again.
    await db.from("founding_members").update({ welcome_sent_at: null }).eq("user_id", member.id);
    return json({ sent: false }, 502);
  }
  return json({ sent: true });
}

// ── Reminders ──────────────────────────────────────────────────────────────

interface Row extends Candidate {
  user_id: string;
  email: string;
  first_name: string;
  unsubscribe_token: string;
}

const NUDGE_SUBJECTS = ["Your Fikko check-in for today", "A minute for today's check-in?", "How's today going?"];

function weekLine(n: number) {
  if (n >= 7) return "You logged every day this week. That's a real habit.";
  if (n >= 4) return `You logged on ${n} of the last 7 days. That's a solid week.`;
  if (n >= 1) return `You logged on ${n} of the last 7 days. Every check-in counts; aim for one more day this week.`;
  return "A fresh week starts today, and one check-in is all it takes to begin.";
}

/** Subject, heading, paragraphs and button for one reminder. No promotions, ever: these are service emails. */
function reminderContent(kind: ReminderKind, row: Row, daysLogged: number, localDate: string) {
  const hi = row.first_name ? `${row.first_name}, ` : "";
  if (kind === "weekly-summary") {
    return {
      subject: "Your week in Fikko",
      heading: "Your week",
      paragraphs: [weekLine(daysLogged), "Open Fikko to see your trends and plan the week ahead."],
      button: "See my week",
    };
  }
  if (kind === "quiet") {
    return {
      subject: "Fikko is here when you're ready",
      heading: "Still here when you're ready",
      paragraphs: [
        `${hi ? `${hi}it's` : "It's"} been a little while since your last check-in. No pressure: pick it back up whenever suits you.`,
        "To keep your inbox quiet, we've slowed reminders to once a week. Log anything and they'll go back to your usual setting.",
      ],
      button: "Open Fikko",
    };
  }
  const day = Number(localDate.slice(8, 10));
  return {
    subject: NUDGE_SUBJECTS[day % NUDGE_SUBJECTS.length],
    heading: "Time for a quick check-in",
    paragraphs: [
      `${hi ? `${hi}nothing's` : "Nothing's"} logged in Fikko yet today. A check-in takes about a minute: water, meals, activity, sleep and mood.`,
      ...(daysLogged > 0 ? [`You've logged on ${daysLogged} of the last 7 days. Keep it going.`] : []),
    ],
    button: "Check in now",
  };
}

async function sendReminders(db: SupabaseClient, now: Date) {
  const { data, error } = await db.rpc("reminder_candidates");
  if (error) throw new Error(`Couldn't load reminder settings: ${error.message}`);
  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Row[]) {
    const plan = decide(row, now);
    if (!plan) continue;
    // Record the day first, so a retry or an overlapping run can't send twice.
    const { data: claimed } = await db.from("reminder_settings")
      .update({ last_sent_on: plan.localDate })
      .eq("user_id", row.user_id)
      .or(`last_sent_on.is.null,last_sent_on.neq.${plan.localDate}`)
      .select("user_id");
    if (!claimed?.length) continue;

    const c = reminderContent(plan.kind, row, plan.daysLoggedThisWeek, plan.localDate);
    const unsubscribe = `${APP_URL}/api/email?unsubscribe=${row.unsubscribe_token}`;
    const settings = `${APP_URL}/?open=profile`;
    try {
      await sendEmail({
        to: row.email,
        subject: c.subject,
        html: layout({
          title: c.subject,
          heading: c.heading,
          paragraphs: c.paragraphs,
          button: { label: c.button, url: APP_URL },
          footnote: "You're getting this because reminders are on in your Fikko settings.",
          links: [{ label: "Change reminder settings", url: settings }, { label: "Turn off reminders", url: unsubscribe }],
        }),
        text: `${c.heading}\n\n${c.paragraphs.join("\n\n")}\n\n${c.button}: ${APP_URL}\n\nChange reminder settings: ${settings}\nTurn off reminders: ${unsubscribe}\n\nFikko · PipePiper, Seoul · hello@fikko.io`,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>, <mailto:hello@fikko.io?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      sent++;
    } catch (err) {
      console.error("Fikko couldn't send a reminder:", err);
      failed++;
      // Give the day back, so the next hourly run doesn't count it as sent. (It
      // only sends at the member's hour, so in practice it's tomorrow.)
      await db.from("reminder_settings").update({ last_sent_on: row.last_sent_on }).eq("user_id", row.user_id);
    }
    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }
  return { sent, failed };
}

// ── Unsubscribe ────────────────────────────────────────────────────────────

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Fikko</title></head>
<body style="margin:0;background:#f6f7f6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f1f1f;">
<main style="max-width:440px;margin:64px auto;padding:32px;background:#fff;border-radius:16px;">
<div style="font-size:24px;font-weight:700;color:#157954;margin-bottom:20px;">Fikko</div>
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const buttonStyle = "background:#157954;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer;";
const muted = "font-size:15px;line-height:1.6;color:#444;";

function unsubscribePage(token: string) {
  return page(
    "Turn off reminder emails?",
    `<p style="${muted}">You'll stop getting Fikko's reminder emails. You'll still get emails about your account, such as password resets.</p>
<form method="post" action="/api/email?unsubscribe=${token}"><button type="submit" style="${buttonStyle}">Turn off reminders</button></form>`,
  );
}

async function unsubscribe(token: string) {
  if (!supabaseReady()) return page("Something went wrong", `<p style="${muted}">Please try again later.</p>`, 503);
  const { error } = await admin().from("reminder_settings")
    .update({ frequency: "off", updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token);
  if (error) return page("Something went wrong", `<p style="${muted}">We couldn't turn reminders off. Please try again, or email hello@fikko.io.</p>`, 500);
  return page(
    "Reminders are off",
    `<p style="${muted}">You won't get any more reminder emails. You can turn them back on any time in Fikko under Profile → Reminders.</p>
<p><a href="${APP_URL}/?open=profile" style="color:#157954;">Open my settings</a></p>`,
  );
}

// ── Routing ────────────────────────────────────────────────────────────────

const tokenFrom = (request: Request) => {
  const t = new URL(request.url).searchParams.get("unsubscribe");
  return t && UUID.test(t) ? t : null;
};

async function handleGET(request: Request) {
  if (new URL(request.url).searchParams.has("unsubscribe")) {
    const token = tokenFrom(request);
    return token ? unsubscribePage(token) : page("Link not recognised", `<p style="${muted}">This unsubscribe link isn't valid. Turn reminders off in Fikko under Profile → Reminders.</p>`, 400);
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);
  if (!supabaseReady() || !emailReady()) return json({ error: "Not configured." }, 503);
  try {
    return json(await sendReminders(admin(), new Date()));
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Reminders failed." }, 500);
  }
}

async function handlePOST(request: Request) {
  if (new URL(request.url).searchParams.has("unsubscribe")) {
    const token = tokenFrom(request);
    return token ? unsubscribe(token) : json({ error: "Unknown link." }, 400);
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "founding-welcome") return foundingWelcome(request);
  return json({ error: "Unknown action." }, 400);
}

export const GET = withCors(handleGET);
export const POST = withCors(handlePOST);
export { OPTIONS };
