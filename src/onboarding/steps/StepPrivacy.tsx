import { ArrowLeft, ArrowRight, BrainCircuit, Sparkles, EyeOff, HandCoins, Loader2, ShieldCheck, Target, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMISES = [
  { icon: EyeOff, title: "We never look at your data", body: "No one at Fikko looks at what you log or what your devices share." },
  { icon: BrainCircuit, title: "Never used to train models", body: "Your data is not used to train any AI or machine learning model." },
  { icon: Watch, title: "Only what is necessary", body: "We collect only the device and fitness data needed to give you fitness advice." },
  { icon: Sparkles, title: "AI features are optional", body: "If you opt in, the AI coach, voice and photo features send what they need to Anthropic to reply. Turn them off any time in Profile → Privacy." },
  { icon: Target, title: "100% ad-free", body: "No ads, and your data is never used to target ads." },
  { icon: HandCoins, title: "Never sold", body: "We never sell your data, to anyone, for any reason." },
];

interface Props {
  onDone: () => void;
  onBack: () => void;
  saving: boolean;
}

export default function StepPrivacy({ onDone, onBack, saving }: Props) {
  return (
    <div>
      <div className="mb-8">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-6 text-primary-ink" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-semibold">Your data stays yours.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One last thing before you start: here is exactly how Fikko treats your information.
        </p>
      </div>

      <section aria-label="Our privacy promises" className="rounded-xl bg-muted/50 p-5 sm:p-6">
        <ul className="divide-y divide-foreground/10">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <p.icon className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 flex gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
        <span>
          Any Google health data you connect is handled under Google's Limited Use requirements: it is used only to
          provide your fitness features, never for ads or sold.
        </span>
      </p>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} disabled={saving} className="h-10 px-3 text-muted-foreground">
          <ArrowLeft />
          Back
        </Button>
        <Button onClick={onDone} disabled={saving} className="h-10 flex-1">
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Go to my dashboard"}
          {!saving && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
