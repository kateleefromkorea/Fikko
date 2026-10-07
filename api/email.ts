// Fikko's own emails, in one function (Vercel's Hobby plan allows 12 per
// deployment). Reminder emails will be sent from here too.
//
//   POST { action: "founding-welcome" }, from the app when a new founding
//     member first sees their welcome: emails them once (migration 030 records
//     when it went out). Does nothing for members without a place.
//
// POST calls carry "Authorization: Bearer <member session token>".

import { admin, json, memberFrom, supabaseReady } from "./_lib/devices.js";
import { emailReady, layout, sendEmail } from "./_lib/email.js";
import { OPTIONS, withCors } from "./_lib/cors.js";

async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "founding-welcome") return json({ error: "Unknown action." }, 400);
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
  const origin = new URL(request.url).origin;
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
        button: { label: "Open Fikko", url: origin },
        footnote: `The full details are in our Terms: ${origin}/terms.html#founding-members`,
      }),
      text: `${paragraphs.join("\n\n")}\n\nOpen Fikko: ${origin}\nTerms: ${origin}/terms.html#founding-members\n\nFikko · PipePiper, Seoul · hello@fikko.io`,
    });
  } catch (err) {
    console.error("Fikko couldn't send the founding welcome:", err);
    // Let a later visit try again.
    await db.from("founding_members").update({ welcome_sent_at: null }).eq("user_id", member.id);
    return json({ sent: false }, 502);
  }
  return json({ sent: true });
}

export const POST = withCors(handlePOST);
export { OPTIONS };
