import { supabase } from "./supabase";

// The supplement and medication interaction check; see api/interactions.ts.

export type Severity = "avoid" | "caution" | "timing" | "overlap";

export interface InteractionFinding {
  items: [string, string];
  severity: Severity;
  advice: string;
  /** "list" for Fikko's built-in list, "ai" for Claude's review. */
  source: "list" | "ai";
}

export interface InteractionResult {
  findings: InteractionFinding[];
  /** Whether Claude reviewed the items the built-in list doesn't know, and if not, why. */
  ai: "not-needed" | "used" | "limit" | "unavailable";
  unrecognised: string[];
}

export async function checkInteractions(names: string[]): Promise<InteractionResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/interactions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ names, tzOffset: new Date().getTimezoneOffset() }),
  });
  const out = (await res.json().catch(() => ({}))) as Partial<InteractionResult> & { error?: string };
  if (!res.ok || !out.findings) throw new Error(out.error ?? "We couldn't run the check. Please try again.");
  return { findings: out.findings, ai: out.ai ?? "not-needed", unrecognised: out.unrecognised ?? [] };
}
