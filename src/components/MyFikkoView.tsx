import { useMemo, useState } from "react";
import { ArrowRight, CalendarCheck, Flame, Lock, Sprout, TriangleAlert, type LucideIcon } from "lucide-react";
import PageHeader from "./PageHeader";
import { SectionLabel, softCardCls } from "./HabitCard";
import FikkoPlant from "./fikko/FikkoPlant";
import SeedPicker, { TierBadge } from "./fikko/SeedPicker";
import type { ProfileRow } from "../hooks/useProfile";
import type { HabitData } from "../types";
import { completion } from "../lib/completion";
import { todayKey } from "../lib/dates";
import {
  COMPANIONS, DIE_AFTER, PLAN_LABEL, POTS, STAGES, WITHER_AFTER,
  computeGrowth, planIncludes, seedById, type Growth, type Plan,
} from "../lib/fikko";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  data: HabitData;
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
  plan: Plan;
  onOpenHabits: () => void;
}

const HEALTH_LABEL = { growing: "Growing", withering: "Withering", dead: "Wilted away" } as const;

export default function MyFikkoView({ data, profile, onUpdateProfile, plan, onOpenHabits }: Props) {
  const seed = seedById(profile.fikko_seed);
  const plantedOn = profile.fikko_planted_on ?? todayKey();
  const growth = useMemo(
    () => computeGrowth(data, plantedOn, profile.water_goal),
    [data, plantedOn, profile.water_goal],
  );

  // Joined before My Fikko existed, or the database hasn't been migrated: pick a seed here.
  if (!seed) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader eyebrow="My Fikko" title="Plant your first seed" subtitle="Every day you complete your habits, your Fikko grows a little more." />
        <PlantSeedCard
          plan={plan}
          title="Choose your seed"
          description="You can change how it looks later. Growth starts from today."
          submitLabel="Plant my seed"
          onPlant={(id) => onUpdateProfile({ fikko_seed: id, fikko_planted_on: todayKey() })}
        />
      </div>
    );
  }

  const title =
    growth.health === "dead" ? `Your ${seed.name} wilted away`
    : growth.health === "withering" ? `Your ${seed.name} needs you`
    : growth.stage === STAGES.length - 1 ? `Your ${seed.name} is in full bloom`
    : `Your ${seed.name} is growing`;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="My Fikko"
        title={title}
        subtitle="Every day you complete all your habits, your Fikko grows."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <PlantHero growth={growth} profile={profile} seedName={seed.name} />
        <div className="flex flex-col gap-6">
          {growth.health === "withering" && (
            <p role="status" className="flex gap-2 rounded-lg pair-d p-4 pl-5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marine" aria-hidden="true" />
              <span>
                Nothing's been logged for {growth.idleDays} days. Log today's habits to bring your {seed.name} back. After{" "}
                {DIE_AFTER} days without care it wilts away.
              </span>
            </p>
          )}
          {growth.health === "dead" ? (
            <PlantSeedCard
              plan={plan}
              initial={seed.id}
              title="Plant a new seed"
              description={`Your ${seed.name} went more than ${DIE_AFTER} days without care. Your seeds, pots and companions are all kept.`}
              submitLabel="Plant new seed"
              onPlant={(id) => onUpdateProfile({ fikko_seed: id, fikko_planted_on: todayKey() })}
            />
          ) : (
            <>
              <GrowthStats growth={growth} />
              <TodayCard data={data} waterGoal={profile.water_goal} onOpenHabits={onOpenHabits} />
            </>
          )}
        </div>
      </div>

      <Customise profile={profile} plan={plan} stage={growth.health === "dead" ? 4 : Math.max(growth.stage, 2)} onUpdateProfile={onUpdateProfile} />

      <HowItWorks />
    </div>
  );
}

/** The plant on the locked teal-and-sky hero panel, with its health and stage. */
function PlantHero({ growth, profile, seedName }: { growth: Growth; profile: ProfileRow; seedName: string }) {
  return (
    <section aria-label="Your plant" className="daily-overview relative flex flex-col items-center overflow-hidden rounded-2xl border border-teal/20 p-6 shadow-sm sm:p-8">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold shadow-sm",
          growth.health === "growing" && "text-primary-ink",
          growth.health === "withering" && "text-[#9A6414]",
          growth.health === "dead" && "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            growth.health === "growing" ? "bg-primary" : growth.health === "withering" ? "bg-[#C9822B]" : "bg-muted-foreground",
          )}
          aria-hidden="true"
        />
        {HEALTH_LABEL[growth.health]}
      </span>
      <FikkoPlant
        seedId={profile.fikko_seed ?? "sprout"}
        stage={growth.stage}
        health={growth.health}
        potId={profile.fikko_pot}
        companionId={profile.fikko_companion}
        animate
        className={cn("my-2 max-w-72", growth.health !== "growing" && "saturate-75")}
      />
      <p className="text-xl font-semibold">{seedName}</p>
      <p className="text-sm text-muted-foreground">{STAGES[growth.stage].name} stage</p>
      <ol className="mt-5 flex w-full max-w-sm items-center justify-between gap-1" aria-label="Growth stages">
        {STAGES.map((s, i) => (
          <li key={s.name} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-full rounded-full",
                i <= growth.stage ? "bg-primary" : "bg-white/80",
              )}
              aria-hidden="true"
            />
            <span className={cn("text-[11px]", i === growth.stage ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {s.name}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string | number; label: string }) {
  return (
    <div className="rounded-lg border p-4">
      <Icon className="size-4 text-primary-ink" aria-hidden="true" />
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function GrowthStats({ growth }: { growth: Growth }) {
  const next = STAGES[growth.stage + 1];
  return (
    <Card className={softCardCls}>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={CalendarCheck} value={growth.completeDays} label={growth.completeDays === 1 ? "complete day" : "complete days"} />
          <Stat icon={Flame} value={growth.streak} label="day streak" />
          <Stat icon={Sprout} value={`${growth.stage + 1}/${STAGES.length}`} label="stage" />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{next ? `Next: ${next.name}` : "Fully grown"}</span>
            <span className="text-muted-foreground tabular-nums">
              {growth.toNextStage == null
                ? "Keep it thriving"
                : `${growth.toNextStage} complete ${growth.toNextStage === 1 ? "day" : "days"} to go`}
            </span>
          </div>
          <Progress value={Math.round(growth.stageProgress * 100)} className="h-2" aria-label="Progress to the next stage" />
        </div>
      </CardContent>
    </Card>
  );
}

function TodayCard({ data, waterGoal, onOpenHabits }: { data: HabitData; waterGoal: number; onOpenHabits: () => void }) {
  const { done, total } = completion(data, todayKey(), waterGoal);
  const complete = total > 0 && done === total;
  return (
    <Card className={softCardCls}>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Today</p>
          <p className="text-sm text-muted-foreground">
            {complete ? "Every habit done. Your Fikko grew today." : `${done} of ${total} habits done. Finish them all to grow.`}
          </p>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn("h-2 flex-1 rounded-full", i < done ? "bg-primary" : "bg-foreground/10")} />
            ))}
          </div>
        </div>
        {!complete && (
          <Button onClick={onOpenHabits} className="h-9 bg-button px-4 hover:bg-button-hover">
            Log habits
            <ArrowRight />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PlantSeedCard({
  plan, initial = null, title, description, submitLabel, onPlant,
}: {
  plan: Plan;
  initial?: string | null;
  title: string;
  description: string;
  submitLabel: string;
  onPlant: (id: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);
  return (
    <Card className={softCardCls}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SeedPicker value={choice} onChange={setChoice} plan={plan} />
        <Button
          disabled={!choice || saving}
          onClick={async () => {
            if (!choice) return;
            setSaving(true);
            try { await onPlant(choice); } finally { setSaving(false); }
          }}
          className="h-10 w-full bg-button hover:bg-button-hover"
        >
          <Sprout />
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Pots and companions, each previewed on the member's own plant. */
function Customise({ profile, plan, stage, onUpdateProfile }: { profile: ProfileRow; plan: Plan; stage: number; onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void> }) {
  const seedId = profile.fikko_seed ?? "sprout";
  const option = (
    key: string,
    name: string,
    tier: Plan,
    selected: boolean,
    onPick: () => void,
    preview: React.ReactNode,
  ) => {
    const locked = !planIncludes(plan, tier);
    return (
      <button
        key={key}
        type="button"
        onClick={() => !locked && onPick()}
        aria-pressed={selected}
        aria-disabled={locked}
        aria-label={locked ? `${name}, included with ${PLAN_LABEL[tier]}` : name}
        className={cn(
          "relative flex flex-col items-center rounded-xl border bg-card p-3 pt-2 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          locked ? "cursor-not-allowed" : "hover:bg-muted/60",
          selected && "border-primary bg-fikko-tint ring-1 ring-primary hover:bg-fikko-tint",
        )}
      >
        <TierBadge tier={tier} className="absolute top-2 right-2" />
        <div className={cn("w-full max-w-24", locked && "opacity-45 grayscale-[40%]")}>{preview}</div>
        <span className="mt-1 text-sm font-medium">{name}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          {locked && <Lock className="size-3" aria-hidden="true" />}
          {locked ? `With ${PLAN_LABEL[tier]}` : selected ? "In use" : "Owned"}
        </span>
      </button>
    );
  };

  return (
    <section className="space-y-4">
      <SectionLabel>Customise</SectionLabel>
      <Card className={softCardCls}>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pots</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {POTS.map((p) =>
                option(p.id, p.name, p.tier, profile.fikko_pot === p.id, () => void onUpdateProfile({ fikko_pot: p.id }),
                  <FikkoPlant seedId={seedId} stage={stage} potId={p.id} />),
              )}
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Companions</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COMPANIONS.map((c) =>
                option(c.id, c.name, c.tier, profile.fikko_companion === c.id, () => void onUpdateProfile({ fikko_companion: c.id }),
                  <FikkoPlant seedId={seedId} stage={stage} potId={profile.fikko_pot} companionId={c.id} />),
              )}
            </div>
          </div>
          {plan !== "max" && (
            <p className="rounded-lg pair-soft p-3 text-sm">
              {plan === "free"
                ? "Premium adds Cherry Blossom and Lavender seeds, the teal pot and a ladybug. Max adds the Golden Lotus, the gold pot and a butterfly."
                : "Max adds the Golden Lotus seed, the gold pot and a butterfly."}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function HowItWorks() {
  const rules = [
    { title: "Grow", body: "Each day you complete every habit, your Fikko gets one day of growth." },
    { title: "Wither", body: `After more than ${WITHER_AFTER} days with nothing logged, it starts to droop. Log a day to revive it.` },
    { title: "Wilt away", body: `After more than ${DIE_AFTER} days, it dies and you plant a new seed. Unlocked items are kept.` },
  ];
  return (
    <section className="space-y-4">
      <SectionLabel>How growing works</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-3">
        {rules.map((r) => (
          <div key={r.title} className="rounded-xl bg-foreground/[0.035] p-4">
            <p className="text-sm font-semibold">{r.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
