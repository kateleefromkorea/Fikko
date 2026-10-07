import { supabase } from "./supabase";

// Email reminder settings (migration 031). The hourly job in api/email.ts
// sends them; see api/_lib/reminders.ts for exactly when.

export type ReminderFrequency = "daily" | "weekdays" | "weekly" | "off";

export interface ReminderSettings { frequency: ReminderFrequency; sendHour: number }

export const DEFAULT_REMINDERS: ReminderSettings = { frequency: "daily", sendHour: 19 };

export const FREQUENCY_OPTIONS: { value: ReminderFrequency; label: string; hint: string }[] = [
  { value: "daily", label: "Daily", hint: "Only on days you haven't logged anything by then." },
  { value: "weekdays", label: "Weekdays", hint: "Monday to Friday, only if you haven't logged yet." },
  { value: "weekly", label: "Weekly summary", hint: "Sundays: how your week went." },
  { value: "off", label: "Off", hint: "No reminder emails." },
];

/** "7 pm", "12 pm", "6 am" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
export const SEND_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 am to 10 pm

const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

/** This member's settings, null if they've never chosen (reminders are off), or undefined if they couldn't load. */
export async function fetchReminderSettings(): Promise<ReminderSettings | null | undefined> {
  const { data, error } = await supabase.from("reminder_settings").select("frequency, send_hour").maybeSingle();
  if (error) return undefined;
  return data ? { frequency: data.frequency as ReminderFrequency, sendHour: data.send_hour } : null;
}

/** Saves the choice, with this device's time zone. */
export async function saveReminderSettings(userId: string, s: ReminderSettings) {
  const { error } = await supabase.from("reminder_settings").upsert({
    user_id: userId,
    frequency: s.frequency,
    send_hour: s.sendHour,
    time_zone: browserTimeZone(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Your reminder settings didn't save. Please try again.");
}

/** Keeps the time zone current when a member travels or moves, so reminders arrive at their local hour. */
export async function syncReminderTimeZone(userId: string) {
  const tz = browserTimeZone();
  await supabase.from("reminder_settings")
    .update({ time_zone: tz, updated_at: new Date().toISOString() })
    .eq("user_id", userId).neq("time_zone", tz);
}
