// Permanently deletes the signed-in user's account and all of their data.
//
// Runs on the server because it needs the Supabase secret key, which bypasses
// row-level security and must never reach the browser. The caller proves who
// they are with their own session token; the function only ever deletes that
// user. Every table references auth.users with ON DELETE CASCADE, so removing
// the auth user removes their profile, habits, food log, medications and
// saved foods with it. Recipe photos live in storage, which doesn't cascade,
// so those are removed first.

import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "You need to be signed in to delete your account." }, 401);

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return json({ error: "Account deletion isn't configured on the server." }, 500);

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Asks Supabase to validate the token, so a forged or expired one is rejected.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: "Your session has expired. Sign in again and retry." }, 401);

  // Photos are stored under "<user id>/" in the recipe-photos bucket.
  const photos = await admin.storage.from("recipe-photos").list(data.user.id, { limit: 1000 });
  if (photos.data?.length) {
    await admin.storage.from("recipe-photos").remove(photos.data.map((f) => `${data.user.id}/${f.name}`));
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return json({ error: "We couldn't delete your account. Please try again." }, 500);

  return json({ deleted: true });
}
