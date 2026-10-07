import { supabase } from "./supabase";

// Founding members (migration 030): the first 100 members to finish setup get
// Premium free for 12 months once paid plans launch. The database claims the
// place when setup is completed; the app only reads it.

/** Keep in step with founding_places_total() in migration 030. */
export const FOUNDING_PLACES = 100;

export interface FoundingPlace { place: number; claimedAt: string }

/** This member's place, or null (none, or migration 030 not run). */
export async function fetchFoundingPlace(): Promise<FoundingPlace | null> {
  const { data, error } = await supabase.from("founding_members").select("place, claimed_at").maybeSingle();
  if (error || !data) return null;
  return { place: data.place, claimedAt: data.claimed_at };
}

/** Places still free, or null if it couldn't be checked. Works signed out. */
export async function fetchPlacesLeft(): Promise<number | null> {
  const { data, error } = await supabase.rpc("founding_places_left");
  return error || typeof data !== "number" ? null : data;
}

/** Asks the server to send the welcome email; it sends at most once. */
export async function sendFoundingWelcome() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch("/api/email", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "founding-welcome" }),
  }).catch(() => {});
}
