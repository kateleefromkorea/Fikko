import { useState } from "react";
import type { useOnboardingState } from "../useOnboardingState";
import { ACTIVITY_LEVELS } from "../../lib/metabolics";
import { ErrorText, Field, SelectCard, StepHeading } from "../ui";

type Api = ReturnType<typeof useOnboardingState>;

const SOURCES = [
  { key: "Apple Health", icon: "🍎", scopes: ["Steps & activity", "Heart rate", "Sleep analysis", "Body measurements"] },
  { key: "Google Fit", icon: "🏃", scopes: ["Steps & activity", "Heart points", "Workouts"] },
  { key: "Fitbit", icon: "📊", scopes: ["Steps & activity", "Sleep stages", "Heart rate"] },
];

export default function StepLifestyle({ api, showError }: { api: Api; showError: boolean }) {
  const { state: s, errors, set } = api;
  // Which source's permission sheet is open, and which is mid-"connect".
  const [asking, setAsking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const sheet = SOURCES.find((x) => x.key === asking);

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

      <div className="flex flex-col gap-2.5">
        {ACTIVITY_LEVELS.map((a) => (
          <SelectCard
            key={a.label}
            icon={a.icon}
            label={a.label}
            description={a.description}
            selected={s.activityLevel === a.label}
            onClick={() => set("activityLevel", a.label)}
          />
        ))}
      </div>

      {showError && errors[5] && <div className="mt-4"><ErrorText>{errors[5]}</ErrorText></div>}

      <div className="mt-6 pt-6 border-t border-border">
        <Field
          label="Sync a health app"
          hint="Optional — and a demo for now: the connection is simulated, no real data leaves or enters your account yet."
        >
          {s.wearable ? (
            <div
              className="rounded-2xl border-2 p-4 flex items-center gap-3.5"
              style={{ borderColor: "var(--primary)", background: "var(--muted)", boxShadow: "0 0 0 3px #FFFFFF" }}
            >
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(21,121,84,0.12)" }}>
                {SOURCES.find((x) => x.key === s.wearable)?.icon ?? "⌚"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{s.wearable} connected</p>
                <p className="text-xs text-muted-foreground">Permission granted · demo data</p>
              </div>
              <button
                type="button"
                onClick={() => set("wearable", null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SOURCES.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setAsking(x.key)}
                  className="rounded-xl border border-border bg-card px-3 py-3 flex items-center gap-2 transition-all hover:opacity-80"
                >
                  <span className="text-lg">{x.icon}</span>
                  <span className="text-xs font-bold text-foreground">{x.key}</span>
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>

      {/* Simulated OS permission sheet. */}
      {sheet && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => !connecting && setAsking(null)}>
          <div
            className="w-full max-w-sm bg-card rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${sheet.key} permission`}
          >
            <div className="text-4xl mb-3">{sheet.icon}</div>
            <h4 className="text-lg font-extrabold text-foreground">Allow Fikko to read {sheet.key}?</h4>
            <p className="text-xs text-muted-foreground mt-1.5">Fikko would like access to:</p>
            <ul className="mt-3 mb-5 flex flex-col gap-1.5 text-left">
              {sheet.scopes.map((sc) => (
                <li key={sc} className="text-sm text-foreground flex items-center gap-2">
                  <span className="text-primary">✓</span>{sc}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mb-4">
              You can turn this off at any time from your profile.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={allow}
                disabled={connecting}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-60"
              >
                {connecting ? "Connecting…" : "Allow"}
              </button>
              <button
                type="button"
                onClick={() => setAsking(null)}
                disabled={connecting}
                className="w-full py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-80 transition-all disabled:opacity-60"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
