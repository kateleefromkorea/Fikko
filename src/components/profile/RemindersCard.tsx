import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_REMINDERS, FREQUENCY_OPTIONS, SEND_HOURS, fetchReminderSettings, hourLabel, saveReminderSettings,
  type ReminderSettings,
} from "../../lib/reminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { friendlyError } from "../../lib/errors";

/** How often and when; used in Profile and in onboarding's last step. */
export function ReminderPicker({ value, onChange, idPrefix = "reminder" }: {
  value: ReminderSettings;
  onChange: (next: ReminderSettings) => void;
  idPrefix?: string;
}) {
  const hint = FREQUENCY_OPTIONS.find((o) => o.value === value.frequency)?.hint;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="How often" className="flex flex-wrap gap-2">
        {FREQUENCY_OPTIONS.map((o) => {
          const on = value.frequency === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...value, frequency: o.value })}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value.frequency !== "off" && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${idPrefix}-hour`} className="text-sm font-normal text-muted-foreground">
            {value.frequency === "weekly" ? "Sundays at" : "At"}
          </Label>
          <Select value={String(value.sendHour)} onValueChange={(h) => onChange({ ...value, sendHour: Number(h) })}>
            <SelectTrigger id={`${idPrefix}-hour`} className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEND_HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">your time</span>
        </div>
      )}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Profile → Reminders. */
export default function RemindersCard({ userId, className }: { userId: string; className?: string }) {
  const [saved, setSaved] = useState<ReminderSettings | null | undefined>(undefined);
  const [draft, setDraft] = useState<ReminderSettings>({ ...DEFAULT_REMINDERS, frequency: "off" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchReminderSettings().then((s) => {
      if (!live) return;
      if (s === undefined) return setLoadFailed(true);
      setSaved(s);
      setDraft(s ?? { ...DEFAULT_REMINDERS, frequency: "off" });
    });
    return () => { live = false; };
  }, []);

  const current = saved ?? { ...DEFAULT_REMINDERS, frequency: "off" as const };
  const changed = draft.frequency !== current.frequency || (draft.frequency !== "off" && draft.sendHour !== current.sendHour);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveReminderSettings(userId, draft);
      setSaved(draft);
      setMessage(draft.frequency === "off" ? "Reminder emails are off." : "Saved. Reminders use this device's time zone.");
    } catch (err) {
      setError(friendlyError(err, "Your reminder settings didn't save. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Reminders</CardTitle>
        <CardDescription>
          A short email when you haven&apos;t checked in yet. At most one a day, and they slow to weekly if you take a break.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadFailed ? (
          <p className="text-sm text-muted-foreground">Reminder settings aren&apos;t available right now. Please try again later.</p>
        ) : saved === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : (
          <>
            <ReminderPicker value={draft} onChange={(v) => { setDraft(v); setMessage(null); }} />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={!changed || busy} className="h-9 px-4">
                {busy && <Loader2 className="animate-spin" />}
                Save
              </Button>
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
