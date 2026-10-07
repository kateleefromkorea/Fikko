import { useMemo, useState } from "react";
import { ArrowRight, CalendarCheck, CloudRain, Crown, Sun, Flame, Lock, Share2, Sprout, Star, TreeDeciduous, TriangleAlert, type LucideIcon } from "lucide-react";
import PageHeader from "./PageHeader";
import { SectionLabel, softCardCls } from "./HabitCard";
import FikkoPlant from "./fikko/FikkoPlant";
import SeedPicker, { TierBadge } from "./fikko/SeedPicker";
import HarvestDialog from "./fikko/HarvestDialog";
import ShareGardenDialog from "./fikko/ShareGardenDialog";
import { useFikkoGarden, type GardenPlant } from "../hooks/useFikkoGarden";
import type { ProfileRow } from "../hooks/useProfile";
import type { HabitData } from "../types";
import { completion } from "../lib/completion";
import { todayKey } from "../lib/dates";
import {
  BLOOM_DAYS, COMPANIONS, DIE_AFTER, GARDENER_SEEDS, MAX_RAIN_CLOUDS, POTS, PREMIUM_EVERY, RAIN_CLOUD_EVERY, SCENES, STAGES, WITHER_AFTER,
  computeGrowth, lockedReason, owns, seedById, unlockedItems, type Growth, type Plan,
} from "../lib/fikko";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  userId: string;
  data: HabitData;
  profile: ProfileRow;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
  plan: Plan;
  onOpenHabits: () => void;
}

const HEALTH_LABEL = { growing: "Growing", withering: "Withering", dead: "Wilted away" } as const;

export default function MyFikkoView({ userId, data, profile, onUpdateProfile, plan, onOpenHabits }: Props) {
  const { garden, harvest } = useFikkoGarden(userId);
  const unlocked = useMemo(() => unlockedItems(garden), [garden]);
  const [harvesting, setHarvesting] = useState(false);
  const seed = seedById(profile.fikko_seed);
  const plantedOn = profile.fikko_planted_on ?? todayKey();
  const growth = useMemo(
    () => computeGrowth(data, plantedOn, profile.water_goal),
    [data, plantedOn, profile.water_goal],
  );

  // Nothing planted: just harvested, joined before My Fikko existed, or the
  // database hasn't been migrated. Pick a seed here.
  if (!seed) {
    const next = garden.length > 0;
    return (
      <div className="space-y-10">
        <PageHeader
          eyebrow="My Fikko"
          title={next ? "Plant your next seed" : "Plant your first seed"}
          subtitle={next
            ? `Your garden has ${garden.length} ${garden.length === 1 ? "plant" : "plants"}. What will you grow next?`
            : "Every day you complete your habits, your Fikko grows a little more."}
        />
        <div className="max-w-3xl">
          <PlantSeedCard
            plan={plan}
            unlocked={unlocked}
            title="Choose your seed"
            description="You can change how it looks later. Growth starts from today."
            submitLabel="Plant my seed"
            onPlant={(id) => onUpdateProfile({ fikko_seed: id, fikko_planted_on: todayKey() })}
          />
        </div>
        {next && <Garden garden={garden} />}
      </div>
    );
  }

  const bloomed = growth.completeDays >= BLOOM_DAYS && growth.health !== "dead";

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
                Nothing&apos;s been logged for {growth.idleDays} days. Log today&apos;s habits to bring your {seed.name} back.
                {bloomed ? " It has bloomed, so it won't die." : ` After ${DIE_AFTER} days without care it wilts away.`}
              </span>
            </p>
          )}
          {bloomed && (
            <Card className={cn(softCardCls, "bg-[#FFFBF0]")}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#FBF1D6]" aria-hidden="true">
                    <Star className="size-5 fill-[#F2B630] text-[#F2B630]" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">Ready to harvest</p>
                    <p className="text-sm text-muted-foreground">
                      Move your {seed.name} to your garden to keep it forever, pick a free reward and plant a real tree.
                      No rush: a plant in full bloom never dies.
                    </p>
                  </div>
                </div>
                <Button onClick={() => setHarvesting(true)} className="h-10 bg-button hover:bg-button-hover">
                  Move to my garden
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          )}
          {growth.health === "dead" ? (
            <PlantSeedCard
              plan={plan}
              unlocked={unlocked}
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

      <Customise profile={profile} plan={plan} unlocked={unlocked} stage={growth.health === "dead" ? 4 : Math.max(growth.stage, 2)} growth={growth} onUpdateProfile={onUpdateProfile} />

      <Garden garden={garden} />

      <HowItWorks />

      <HarvestDialog
        open={harvesting}
        onOpenChange={setHarvesting}
        seedId={seed.id}
        potId={profile.fikko_pot}
        companionId={profile.fikko_companion}
        unlocked={unlocked}
        onHarvest={async (reward) => {
          const result = await harvest(growth.completeDays, reward);
          // The database emptied the pot; mirror it here so the page moves on.
          await onUpdateProfile({ fikko_seed: null, fikko_planted_on: null });
          return result;
        }}
      />
    </div>
  );
}

/** Every plant grown to full bloom, what the garden has achieved, and a way to share it. */
function Garden({ garden }: { garden: GardenPlant[] }) {
  const [sharing, setSharing] = useState(false);
  const days = garden.reduce((sum, p) => sum + p.completeDays, 0);
  const planted = garden.filter((p) => p.treeStatus === "planted").length;
  const months = garden.filter((p) => p.premiumMonth).length;
  const nextBonus = GARDENER_SEEDS.find((b) => b.at > garden.length);
  const toPremium = PREMIUM_EVERY - (garden.length % PREMIUM_EVERY);

  return (
    <section className="space-y-4">
      <SectionLabel
        aside={garden.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setSharing(true)} className="h-8">
            <Share2 />
            Share my garden
          </Button>
        )}
      >
        My garden
      </SectionLabel>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Sprout} value={days} label="complete days grown" />
        <Stat
          icon={TreeDeciduous}
          value={garden.length}
          label={`real ${garden.length === 1 ? "tree" : "trees"}${garden.length > planted ? ` · ${garden.length - planted} on the way` : ""}`}
        />
        <Stat icon={Crown} value={months} label={months === 1 ? "Premium month earned" : "Premium months earned"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {garden.map((p) => (
          <div key={p.id} className="flex flex-col items-center rounded-xl border bg-card p-3 text-center">
            <FikkoPlant seedId={p.seed} stage={4} potId={p.pot} companionId={p.companion} className="max-w-28" />
            <span className="mt-1 text-sm font-medium">{seedById(p.seed)?.name}</span>
            <span className="text-xs text-muted-foreground">
              Bloomed {new Date(p.harvestedOn + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary-ink">
              <TreeDeciduous className="size-3" aria-hidden="true" />
              {p.treeStatus === "planted" ? "Tree planted" : "Tree on its way"}
            </span>
          </div>
        ))}
        <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
          <Sprout className="mb-2 size-5" aria-hidden="true" />
          Your next bloom goes here
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {nextBonus
          ? `${nextBonus.at - garden.length} more ${nextBonus.at - garden.length === 1 ? "bloom" : "blooms"} to unlock the ${seedById(nextBonus.seed)?.name}. `
          : ""}
        Every {PREMIUM_EVERY === 3 ? "third" : `${PREMIUM_EVERY}th`} bloom earns a free month of Premium ({toPremium} to go, up to one a year).
      </p>

      <ShareGardenDialog open={sharing} onOpenChange={setSharing} garden={garden} />
    </section>
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
        sceneId={profile.fikko_scene}
        sunny={growth.sunny}
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
  plan, unlocked, initial = null, title, description, submitLabel, onPlant,
}: {
  plan: Plan;
  unlocked: string[];
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
        <SeedPicker value={choice} onChange={setChoice} plan={plan} unlocked={unlocked} />
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

type Item = (typeof POTS)[number] | (typeof COMPANIONS)[number] | (typeof SCENES)[number];

/**
 * Everything the member can dress their plant in, as tabs: pots, companions,
 * scenes and boosters. Their plant stays beside the tabs, wearing whatever is
 * picked, and each tab counts how many of its items they own.
 */
function Customise({
  profile, plan, unlocked, stage, growth, onUpdateProfile,
}: {
  profile: ProfileRow;
  plan: Plan;
  unlocked: string[];
  stage: number;
  growth: Growth;
  onUpdateProfile: (patch: Partial<ProfileRow>) => Promise<void>;
}) {
  const seedId = profile.fikko_seed ?? "sprout";
  const look = { seedId, stage, potId: profile.fikko_pot, companionId: profile.fikko_companion, sceneId: profile.fikko_scene };
  const owned = (items: Item[]) => items.filter((i) => owns(i, plan, unlocked)).length;

  const option = (item: Item, selected: boolean, onPick: () => void, preview: React.ReactNode) => {
    const { id: key, name, tier, earned } = item;
    const locked = !owns(item, plan, unlocked);
    return (
      <button
        key={key}
        type="button"
        onClick={() => !locked && onPick()}
        aria-pressed={selected}
        aria-disabled={locked}
        aria-label={locked ? `${name}, locked: ${lockedReason(item)}` : name}
        className={cn(
          "relative flex flex-col items-center rounded-xl border bg-card p-3 pt-2 text-center transition-[background-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          locked ? "cursor-not-allowed" : "hover:-translate-y-0.5 hover:bg-muted/60",
          selected && "border-[#1A9C8C] bg-[#DDF5F1] ring-1 ring-[#1A9C8C] hover:bg-[#DDF5F1]",
        )}
      >
        <TierBadge tier={tier} earned={earned} className="absolute top-2 right-2 z-10" />
        {/* Locked items show as a soft silhouette of what's to come. */}
        <div className={cn("w-full max-w-24", locked && "opacity-40 brightness-75 grayscale")}>{preview}</div>
        <span className="mt-1 text-sm font-medium">{name}</span>
        <span className={cn("mt-0.5 flex items-center gap-1 text-xs", selected ? "font-medium text-[#0A6E63]" : "text-muted-foreground")}>
          {locked && <Lock className="size-3" aria-hidden="true" />}
          {locked ? lockedReason(item) : selected ? "In use" : "Owned"}
        </span>
      </button>
    );
  };

  const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4";
  const tabs = [
    { value: "pots", label: "Pots", count: `${owned(POTS)}/${POTS.length}` },
    { value: "companions", label: "Companions", count: `${owned(COMPANIONS)}/${COMPANIONS.length}` },
    { value: "scenes", label: "Scenes", count: `${owned(SCENES)}/${SCENES.length}` },
    { value: "boosters", label: "Boosters", count: growth.rainClouds > 0 ? String(growth.rainClouds) : null },
  ];

  return (
    <section className="space-y-4">
      <SectionLabel>Customise</SectionLabel>
      <Card className={softCardCls}>
        <CardContent className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* The member's plant, wearing their picks. Stays in view on wide screens. */}
          <div className="flex flex-col items-center self-start rounded-2xl bg-foreground/[0.03] p-4 md:sticky md:top-32">
            <FikkoPlant {...look} sunny={growth.sunny} animate className="max-w-52" />
            <p className="mt-2 text-sm font-medium">Your Fikko</p>
            <p className="text-xs text-muted-foreground">Tap anything to try it on</p>
          </div>

          <Tabs defaultValue="pots" className="min-w-0 gap-4">
            <TabsList className="h-auto w-full flex-wrap justify-start">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="flex-none gap-1.5 px-3">
                  {t.label}
                  {t.count && <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] font-medium text-foreground/80 tabular-nums">{t.count}</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="pots" className={grid}>
              {POTS.map((p) =>
                option(p, profile.fikko_pot === p.id, () => void onUpdateProfile({ fikko_pot: p.id }),
                  <FikkoPlant {...look} potId={p.id} sceneId="plain" />),
              )}
            </TabsContent>
            <TabsContent value="companions" className={grid}>
              {COMPANIONS.map((c) =>
                option(c, profile.fikko_companion === c.id, () => void onUpdateProfile({ fikko_companion: c.id }),
                  <FikkoPlant {...look} companionId={c.id} sceneId="plain" />),
              )}
            </TabsContent>
            <TabsContent value="scenes" className={grid}>
              {SCENES.map((sc) =>
                option(sc, profile.fikko_scene === sc.id, () => void onUpdateProfile({ fikko_scene: sc.id }),
                  <FikkoPlant {...look} sceneId={sc.id} />),
              )}
            </TabsContent>
            <TabsContent value="boosters">
              <Boosters growth={growth} />
            </TabsContent>

            <p className="rounded-lg pair-soft p-3 text-sm">
              Gardener items are free on every plan: pick one each time you harvest a plant.
              {plan === "free"
                ? " Premium adds Cherry Blossom and Lavender seeds, the teal pot, a ladybug and the rainy day scene. Max adds the Golden Lotus, the gold pot, a butterfly and the night sky."
                : plan === "premium" ? " Max adds the Golden Lotus seed, the gold pot, a butterfly and the night sky." : ""}
            </p>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}

/** Helpers earned by keeping at it. They protect and celebrate the plant, never speed it up. */
function Boosters({ growth }: { growth: Growth }) {
  const slots = Array.from({ length: MAX_RAIN_CLOUDS }, (_, i) => i < growth.rainClouds);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#E2EFFC] text-[#1F6AB0]" aria-hidden="true">
            <CloudRain className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Rain cloud</p>
            <p className="text-sm text-muted-foreground">
              Covers a day with nothing logged, so your plant doesn&apos;t wilt and your streak carries on. Used up automatically.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2" aria-label={`${growth.rainClouds} of ${MAX_RAIN_CLOUDS} rain clouds held`}>
          {slots.map((held, i) => (
            <span
              key={i}
              className={cn("grid size-9 place-items-center rounded-full", held ? "bg-[#E2EFFC] text-[#1F6AB0]" : "border border-dashed text-muted-foreground/50")}
              aria-hidden="true"
            >
              <CloudRain className="size-4" />
            </span>
          ))}
          <span className="ml-1 text-sm font-medium tabular-nums">{growth.rainClouds}/{MAX_RAIN_CLOUDS}</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {growth.rainClouds >= MAX_RAIN_CLOUDS
            ? "You're holding as many as you can."
            : `${growth.toNextRainCloud} more complete ${growth.toNextRainCloud === 1 ? "day" : "days"} in a row for the next one.`}
          {growth.rainCloudsUsed > 0 && ` ${growth.rainCloudsUsed} ${growth.rainCloudsUsed === 1 ? "has" : "have"} already covered a missed day.`}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#FBF1D6] text-[#8A6414]" aria-hidden="true">
            <Sun className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Sunshine</p>
            <p className="text-sm text-muted-foreground">The sun comes out over your plant on every day you complete all your habits.</p>
          </div>
        </div>
        <p className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", growth.sunny ? "bg-[#FBF1D6] text-[#8A6414]" : "bg-foreground/[0.05] text-muted-foreground")}>
          <Sun className="size-3.5" aria-hidden="true" />
          {growth.sunny ? "Shining today" : "Finish today's habits to make it shine"}
        </p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const rules = [
    { title: "Grow", body: "Each day you complete every habit, your Fikko gets one day of growth." },
    { title: "Wither", body: `After more than ${WITHER_AFTER} days with nothing logged, it starts to droop. Log a day to revive it.` },
    { title: "Rain clouds", body: `Every ${RAIN_CLOUD_EVERY} complete days in a row earn a rain cloud, which covers a missed day for you. Hold up to ${MAX_RAIN_CLOUDS}.` },
    { title: "Wilt away", body: `After more than ${DIE_AFTER} days, it dies and you plant a new seed. Unlocked items are kept.` },
    { title: "Harvest", body: `At ${BLOOM_DAYS} complete days it blooms. Move it to your garden for a free reward and a real tree.` },
  ];
  return (
    <section className="space-y-4">
      <SectionLabel>How growing works</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
