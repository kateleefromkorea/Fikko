// How many founding-member places are left, for the marketing site's pricing
// section (www.fikko.io calls this from another origin). One public number,
// so any origin may read it. Cached at the edge for a minute.

import { admin, supabaseReady } from "./_lib/devices.js";

const TOTAL = 100; // founding_places_total() in migration 030

async function handleGET() {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  };
  if (!supabaseReady()) return new Response(JSON.stringify({ left: null, total: TOTAL }), { status: 503, headers });
  const { data, error } = await admin().rpc("founding_places_left");
  const left = error || typeof data !== "number" ? null : data;
  return new Response(JSON.stringify({ left, total: TOTAL }), { status: left == null ? 502 : 200, headers });
}

export const GET = handleGET;
