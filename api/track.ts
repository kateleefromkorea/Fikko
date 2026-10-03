// Privacy-friendly visitor stats. The app and the marketing site send one
// small beacon per page view; this turns it into anonymous daily counters
// (see migration 016). No cookies, and nothing that identifies a person is
// stored: the IP address and browser are only mixed into a hash with a salt
// that changes every day, so the same visitor can't be linked across days.
//
// Beacons arrive as text/plain so the marketing site (another origin) can send
// them without a CORS preflight. Nothing useful is sent back.

import { admin, supabaseReady } from "./_lib/devices.js";

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|facebookexternalhit|curl|wget|python|axios|node-fetch/i;

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!supabaseReady()) return noContent();
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return noContent();

  const text = await request.text().catch(() => "");
  if (text.length > 1000) return noContent();
  let body: { site?: unknown; path?: unknown; ref?: unknown; host?: unknown };
  try { body = JSON.parse(text); } catch { return noContent(); }
  if (body.site !== "web" && body.site !== "app") return noContent();

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
  const day = new Date().toISOString().slice(0, 10);
  const visitor = await sha256(`${day}|${process.env.SUPABASE_SECRET_KEY}|${body.site}|${ip}|${ua}`);

  await admin().rpc("track_page_view", {
    p_site: body.site,
    p_path: cleanPath(body.path),
    p_referrer: referrerHost(body.ref, body.host),
    p_device: device(ua),
    p_country: (request.headers.get("x-vercel-ip-country") ?? "").slice(0, 2),
    p_visitor: `\\x${visitor}`,
  });
  return noContent();
}

/** "/Careers/?utm=x#top" → "/careers". Anything odd becomes "(other)". */
function cleanPath(raw: unknown) {
  if (typeof raw !== "string") return "/";
  const path = raw.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") || "/";
  return /^\/[a-z0-9/_.-]{0,79}$/.test(path) ? path : "(other)";
}

/** Just the site someone came from, e.g. "google.com". Links within the same site count as direct. */
function referrerHost(ref: unknown, host: unknown) {
  if (typeof ref !== "string" || !ref) return "direct";
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    if (!h || h === String(host).toLowerCase().replace(/^www\./, "")) return "direct";
    return /^[a-z0-9.-]{1,80}$/.test(h) ? h : "(other)";
  } catch {
    return "direct";
  }
}

function device(ua: string) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

async function sha256(s: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
