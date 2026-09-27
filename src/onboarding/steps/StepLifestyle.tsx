import { useState } from "react";
import { Activity, Check, Heart, Loader2, Watch, type LucideIcon } from "lucide-react";
import type { useOnboardingState } from "../useOnboardingState";
import { ACTIVITY_LEVELS } from "../../lib/metabolics";
import { ACTIVITY_ICONS, ErrorText, FALLBACK_ICON, Field, SelectCard, StepHeading } from "../ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Api = ReturnType<typeof useOnboardingState>;

const SOURCES: { key: string; icon: LucideIcon; scopes: string[] }[] = [
  { key: "Apple Health", icon: Heart, scopes: ["Steps & activity", "Heart rate", "Sleep analysis", "Body measurements"] },
  { key: "Google Fit", icon: Activity, scopes: ["Steps & activity", "Heart points", "Workouts"] },
  { key: "Fitbit", icon: Watch, scopes: ["Steps & activity", "Sleep stages", "Heart rate"] },
];

export default function StepLifestyle({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, errors, set } = api;
  // Which source's permission sheet is open, and which is mid-"connect".
  const [asking, setAsking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const sheet = SOURCES.find((x) => x.key === asking);
  const connected = SOURCES.find((x) => x.key === s.wearable);
  const ConnectedIcon = connected?.icon ?? Watch;

  function allow() {
    if (!sheet) return;
    setConnecting(true);
    // Stands in for the real permission round trip, which needs a native
    // shell — HealthKit is not reachable from a browser.
    setTimeout(() => {
      set("wearable", sheet.key);
      setConnecting(false);
      setAsking(null);
    }, 900);
  }

  return (
    <div>
      <StepHeading
        title="How active is your week?"
        subtitle="This is the multiplier on top of your resting burn, so it moves your target the most."
      />

      <div className="flex flex-col gap-2">
        {ACTIVITY_LEVELS.map((a) => (
          <SelectCard
            key={a.label}
            icon={ACTIVITY_ICONS[a.label] ?? FALLBACK_ICON}
            label={a.label}
            description={a.description}
            selected={s.activityLevel === a.label}
            onClick={() => set("activityLevel", a.label)}
          />
        ))}
      </div>

      {showError && errors[5] && <div className="mt-4"><ErrorText>{errors[5]}</ErrorText></div>}

      <div className="mt-8 border-t pt-8">
        <Field
          label="Sync a health app"
          hint="Optional, and a demo for now: the connection is simulated, no real data leaves or enters your account yet."
        >
          {s.wearable ? (
            <div className="flex items-center gap-4 rounded-lg border border-primary bg-primary/5 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                <ConnectedIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.wearable} connected</p>
                <p className="text-sm text-muted-foreground">Permission granted · demo data</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => set("wearable", null)} className="h-8 px-3">
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SOURCES.map((x) => (
                <Button
                  key={x.key}
                  type="button"
                  variant="outline"
                  onClick={() => setAsking(x.key)}
                  className="h-11 justify-start px-4"
                >
                  <x.icon className="text-muted-foreground" />
                  {x.key}
                </Button>
              ))}
            </div>
          )}
        </Field>
      </div>

      {/* Simulated OS permission sheet. */}
      <Dialog open={!!sheet} onOpenChange={(open) => !open && !connecting && setAsking(null)}>
        {sheet && (
          <DialogContent showCloseButton={false} className="gap-6 p-6 sm:max-w-sm">
            <DialogHeader className="items-center text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-muted" aria-hidden="true">
                <sheet.icon className="size-6" />
              </span>
              <DialogTitle className="text-lg font-semibold">Allow Fikko to read {sheet.key}?</DialogTitle>
              <DialogDescription>Fikko would like access to:</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2">
              {sheet.scopes.map((sc) => (
                <li key={sc} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  {sc}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">You can turn this off at any time from your profile.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={allow} disabled={connecting} className="h-9">
                {connecting && <Loader2 className="animate-spin" />}
                {connecting ? "Connecting…" : "Allow"}
              </Button>
              <Button variant="ghost" onClick={() => setAsking(null)} disabled={connecting} className="h-9">
                Not now
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
