// Sending Fikko's own emails (not the sign-in emails, which Supabase sends)
// through Resend's API. Needs RESEND_API_KEY in the server's environment; the
// sender address must be on a domain verified in Resend (fikko.io).
//
// Keep emails plain: one message, one button, the Fikko footer. Reminder emails
// must never carry promotions, so they stay service emails.

const FROM = process.env.EMAIL_FROM ?? "Fikko <hello@fikko.io>";

export const emailReady = () => !!process.env.RESEND_API_KEY;

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  if (!emailReady()) throw new Error("Email isn't set up on the server (RESEND_API_KEY).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text, reply_to: "hello@fikko.io" }),
  });
  if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The same layout as the sign-in emails in email-templates/. `paragraphs` are
 * plain text (escaped here); `footnote` is small grey text under the button.
 */
export function layout({ title, heading, paragraphs, button, footnote }: {
  title: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footnote?: string;
}) {
  const font = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#444444;">${esc(p)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;font-family:${font};color:#1f1f1f;">
        <tr><td style="padding:32px 32px 0;"><div style="font-size:24px;font-weight:700;color:#157954;letter-spacing:-0.5px;">Fikko</div></td></tr>
        <tr>
          <td style="padding:24px 32px 4px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;line-height:1.3;">${esc(heading)}</h1>
            ${body}
          </td>
        </tr>
        ${button ? `<tr><td style="padding:12px 32px 24px;"><a href="${esc(button.url)}" style="display:inline-block;background:#157954;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;">${esc(button.label)}</a></td></tr>` : ""}
        ${footnote ? `<tr><td style="padding:0 32px 32px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b6b;">${esc(footnote)}</p></td></tr>` : `<tr><td style="padding:0 0 16px;"></td></tr>`}
      </table>
      <p style="margin:16px 0 0;font-family:${font};font-size:12px;color:#8a8a8a;">
        Fikko · PipePiper, Seoul · Questions? <a href="mailto:hello@fikko.io" style="color:#8a8a8a;">hello@fikko.io</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}
