// Privacy consents: what Fikko asks each member to agree to, tailored to the
// country they're in, and the calls that record their answers (/api/consent,
// migration 022). Keep POLICY_VERSION and the keys in step with
// api/_lib/consent.ts.

import { supabase } from "./supabase";

/** Bump (here and on the server) when the Privacy Policy changes enough that members must agree again. */
export const POLICY_VERSION = "2026-10-04";

export type ConsentKey = "terms" | "personal_info" | "health_data" | "overseas_transfer" | "ai_processing";
export type Region = "KR" | "AU" | "SG" | "US" | "OTHER";
export type ConsentState = Partial<Record<ConsentKey, { granted: boolean; policy_version: string; region: string; created_at: string }>>;

export const REGION_NAMES: Record<Region, string> = {
  KR: "South Korea",
  AU: "Australia",
  SG: "Singapore",
  US: "United States",
  OTHER: "Somewhere else",
};

export interface ConsentItem {
  key: ConsentKey;
  required: boolean;
  title: string;
  /** The Korean name PIPA notices use, shown to members in Korea. */
  ko: string;
  /** Each row answers one of PIPA's questions: what, why, who, how long, and what refusing means. */
  details: { label: string; text: string }[];
}

export const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "terms",
    required: true,
    title: "I'm 14 or older and agree to the Terms of Use and Privacy Policy",
    ko: "이용약관 및 개인정보 처리방침 동의 (만 14세 이상)",
    details: [],
  },
  {
    key: "personal_info",
    required: true,
    title: "Collection and use of my personal information",
    ko: "개인정보 수집·이용 동의",
    details: [
      { label: "What", text: "Email address, name, date of birth, sex, height, weight, goals, diet and allergies, and what you log." },
      { label: "Why", text: "To run your account, work out your targets and show your own habits and insights." },
      { label: "How long", text: "Until you delete your account, then 30 days more in case you change your mind." },
      { label: "If you say no", text: "Fikko can't work without these, so you won't be able to use it." },
    ],
  },
  {
    key: "health_data",
    required: true,
    title: "Collection and use of my health information",
    ko: "민감정보(건강정보) 수집·이용 동의",
    details: [
      {
        label: "What",
        text: "Weight, meals, activity, sleep, mood, the medications and supplements you add, and, if you connect a device, its daily summaries such as heart rate, HRV, sleep stages, blood oxygen and steps.",
      },
      { label: "Why", text: "Only to show you your own habits, trends and insights. Never for ads, and never sold." },
      { label: "How long", text: "Until you delete your account, then 30 days more. Disconnecting a device lets you delete what it synced." },
      { label: "If you say no", text: "Tracking these is what Fikko does, so you won't be able to use it." },
    ],
  },
  {
    key: "overseas_transfer",
    required: true,
    title: "Storing my information outside my country",
    ko: "개인정보 국외 이전 동의",
    details: [
      { label: "Who and where", text: "Supabase, Inc. stores your account and everything you log on its servers in Singapore. Vercel, Inc. (United States) hosts the app, so your requests pass through it. Google LLC (United States) is involved only if you sign in with Google or connect Fitbit or Pixel Watch." },
      { label: "When and how", text: "Whenever you use Fikko, over encrypted connections." },
      { label: "Why", text: "To store your data and run the app." },
      { label: "How long", text: "Until you delete your account, then 30 days more. Hosting logs are kept briefly for security." },
      { label: "If you say no", text: "These providers run Fikko, so you won't be able to use it." },
    ],
  },
  {
    key: "ai_processing",
    required: false,
    title: "Using AI features (sends some of my data to Anthropic in the United States)",
    ko: "AI 기능 이용을 위한 개인정보 국외 이전 동의 (선택)",
    details: [
      {
        label: "What's sent",
        text: "AI coach: your message, recent conversation, profile details such as goals, diet and allergies, and your last four weeks of logs. Voice check-ins: what you said, as text, plus the names of your medications and custom habits. Photo logging: the meal photo, without your name. Medication check: names Fikko's own list doesn't recognise. Never your email address.",
      },
      { label: "Who and where", text: "Anthropic, PBC, in the United States, which runs the Claude AI model." },
      { label: "Why", text: "To write the coach's replies, turn what you say or photograph into log entries, and check medication names. Replies are automatic suggestions, not medical advice, and nobody at Fikko reads them." },
      { label: "How long", text: "Anthropic deletes it within 30 days and doesn't use it to train its models. Content its safety systems flag may be kept up to 2 years. Coach chats stay in Fikko until you clear them." },
      { label: "If you say no", text: "Everything else works. The AI coach, voice check-ins, photo logging and the AI part of the medication check stay off. You can change this any time in Profile → Privacy." },
    ],
  },
];

/** What the laws in each market add to the notice, shown above the choices. */
export const REGION_NOTES: Record<Region, string[]> = {
  KR: [
    "Under Korea's Personal Information Protection Act (PIPA), each consent below is separate. You can refuse any of them. Refusing a required one means you can't use Fikko; refusing the optional one doesn't affect anything else.",
    "Questions or complaints: our Chief Privacy Officer, Seok Hwan Lee, at hello@fikko.io, or the Privacy Call Center (118).",
  ],
  AU: [
    "Health information is sensitive information under the Privacy Act 1988, so we only collect it with your consent (APP 3).",
    "Some of your information is held overseas, in Singapore and the United States (APP 8). You can complain to the Office of the Australian Information Commissioner.",
  ],
  SG: [
    "Under the PDPA, we tell you why we collect your data before we do, and you can withdraw consent at any time.",
    "About Fikko's AI: it suggests habits and turns your words or photos into log entries. It uses only the data listed under AI features, makes no decisions about you, and you can use Fikko without it.",
  ],
  US: [
    "Notice at collection: we collect identifiers (email, name), personal details (date of birth, sex, body measurements) and consumer health data (what you log and device data), for the purposes below. We don't sell or share personal information, and we never sell consumer health data.",
    "If you live in Washington, Nevada or Connecticut, the health information consent below is your consent to collect consumer health data. We only share it with the providers named here.",
  ],
  OTHER: [
    "Fikko is offered in Australia, Singapore, South Korea and the United States. We'll treat your information with the same protections.",
  ],
};

export const REQUIRED_KEYS = CONSENT_ITEMS.filter((c) => c.required).map((c) => c.key);

/** True when the member has agreed to everything required under the current policy. */
export function hasRequiredConsent(consents: ConsentState) {
  return REQUIRED_KEYS.every((k) => consents[k]?.granted && consents[k]?.policy_version === POLICY_VERSION);
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The member's consents, and which country's notice to show for where they are. */
export async function fetchConsents(): Promise<{ region: Region; consents: ConsentState }> {
  try {
    const res = await fetch("/api/consent", { headers: await authHeaders() });
    if (!res.ok) throw new Error();
    const body = (await res.json()) as { region?: Region; consents?: ConsentState };
    return { region: body.region ?? "OTHER", consents: body.consents ?? {} };
  } catch {
    return { region: "OTHER", consents: {} };
  }
}

export async function saveConsents(region: Region, choices: Partial<Record<ConsentKey, boolean>>): Promise<ConsentState> {
  const res = await fetch("/api/consent", {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ region, choices }),
  });
  const body = (await res.json().catch(() => ({}))) as { consents?: ConsentState; error?: string };
  if (!res.ok || !body.consents) throw new Error(body.error ?? "We couldn't save your choices. Please try again.");
  return body.consents;
}
