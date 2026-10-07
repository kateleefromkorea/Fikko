import { useEffect, useState } from "react";
import GoogleHealthDisclosure from "../../components/profile/GoogleHealthDisclosure";
import { BetaGate } from "../../components/profile/WearableBetaInvite";
import { Check, Heart, Loader2, Watch, type LucideIcon } from "lucide-react";
import type { useOnboardingState } from "../useOnboardingState";
import { saveDraft } from "../draft";
import { ACTIVITY_LEVELS } from "../../lib/metabolics";
import { PROVIDER_INFO, connectDevice, fetchConnections } from "../../lib/devices";
import type { DeviceOutcome } from "../../components/profile/DevicesCard";
import { ACTIVITY_ICONS, ErrorText, FALLBACK_ICON, Field, SelectCard, StepHeading } from "../ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Api = ReturnType<typeof useOnboardingState>;

const FITBIT = PROVIDER_INFO.google.name;

// Listed so members know they're on the way; they connect from Profile once built.
const SOON: { name: string; icon: LucideIcon }[] = [
  { name: "Apple Health", icon: Heart },
  { name: "Garmin Connect", icon: Watch },
];

export default function StepLifestyle({ api, showError, userId, outcome }: {
  api: Api;
  showError: boolean;
  userId: string;
  /** How the Fitbit sign-in went, when the member has just come back from it. */
  outcome: DeviceOutcome | null;
}) {
  const { state: s, errors, set } = api;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(
    outcome?.result === "declined" ? `${FITBIT} wasn't connected because access wasn't approved.`
      : outcome?.result === "failed" ? `We couldn't connect ${FITBIT}. You can try again, or later from your Profile.`
        : null,
  );

  // The real connection decides what's shown, not just what was saved in the answers.
  useEffect(() => {
    let live = true;
    void fetchConnections().then((conns) => {
      if (!live) return;
      const active = conns.some((c) => c.provider === "google" && c.status === "active");
      set("wearable", active ? FITBIT : null);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival at this step
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    // Park the answers so far; the sign-in leaves this page and brings the member back to this step.
    saveDraft({ userId, step: 5, state: s });
    try {
      await connectDevice("google");
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
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
          label="Sync a wearable"
          hint="Optional. You'll sign in with Google to approve read-only access, then come straight back here. Manage it any time in Profile."
        >
          {s.wearable === FITBIT ? (
            <div className="flex items-center gap-4 rounded-lg border border-primary bg-primary/5 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary-ink" aria-hidden="true">
                <Check className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{FITBIT} connected</p>
                <p className="text-sm text-muted-foreground">Your last 30 days are synced, and new data syncs every night.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <GoogleHealthDisclosure />
              <BetaGate provider="google" connected={false}>
                <Button type="button" variant="outline" onClick={connect} disabled={connecting} className="h-11 justify-start px-4">
                  {connecting ? <Loader2 className="animate-spin" /> : <Watch className="text-muted-foreground" />}
                  {connecting ? "Opening Google sign-in…" : `Connect ${FITBIT}`}
                </Button>
              </BetaGate>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SOON.map((x) => (
                  <div key={x.name} className="flex h-11 items-center gap-2 rounded-md border px-4 text-sm text-muted-foreground">
                    <x.icon className="size-4" aria-hidden="true" />
                    <span className="flex-1">{x.name}</span>
                    <Badge variant="secondary">Soon</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </Field>
      </div>
    </div>
  );
}
