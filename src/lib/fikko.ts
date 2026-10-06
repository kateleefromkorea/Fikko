import type { HabitData } from "../types";
import { completion } from "./completion";
import { loggedOn } from "./dashboardStats";
import { shiftDateKey, todayKey } from "./dates";

// My Fikko: the plant a member grows by completing their habits (migration 025).
// Only the seed, planting day and cosmetics are stored; growth and health are
// worked out here from the habit log, so they can never drift from it.

/** Matches api/_lib/plans.ts. */
export type Plan = "free" | "premium" | "max";

/**
 * The member's plan. Payments aren't live yet, so everyone is on Free and the
 * Premium and Max items show as locked.
 */
export const CURRENT_PLAN: Plan = "free";

const PLAN_RANK: Record<Plan, number> = { free: 0, premium: 1, max: 2 };
export const planIncludes = (plan: Plan, tier: Plan) => PLAN_RANK[plan] >= PLAN_RANK[tier];
export const PLAN_LABEL: Record<Plan, string> = { free: "Free", premium: "Premium", max: "Max" };

export type FlowerShape = "leaf" | "daisy" | "tulip" | "spike";

/**
 * How a member gets an item: by plan, or (`earned`) by harvesting. Earned
 * items are free on every plan once unlocked; see owns().
 */
interface Unlockable { id: string; name: string; tier: Plan; earned?: boolean }

export interface Seed extends Unlockable {
  blurb: string;
  leaf: string;
  leafLight: string;
  flower: string;
  shape: FlowerShape;
}

export const SEEDS: Seed[] = [
  { id: "sprout", name: "Fikko Sprout", tier: "free", blurb: "Fikko's own leaf, with a star ornament", leaf: "#22A06B", leafLight: "#2DC4B2", flower: "#2DC4B2", shape: "leaf" },
  { id: "sunflower", name: "Sunflower", tier: "free", blurb: "Tall and always cheerful", leaf: "#3E9B4F", leafLight: "#58B565", flower: "#F2B630", shape: "daisy" },
  { id: "tulip", name: "Tulip", tier: "free", blurb: "A classic spring bloom", leaf: "#2F9A6A", leafLight: "#45B07E", flower: "#EE6A7B", shape: "tulip" },
  { id: "blossom", name: "Cherry Blossom", tier: "premium", blurb: "Soft pink petals", leaf: "#4E9A5B", leafLight: "#6DB47A", flower: "#F6A9C4", shape: "daisy" },
  { id: "lavender", name: "Lavender", tier: "premium", blurb: "Calm, fragrant spikes", leaf: "#3F8C74", leafLight: "#5AA68D", flower: "#9C7FE0", shape: "spike" },
  { id: "lotus", name: "Golden Lotus", tier: "max", blurb: "Rare and radiant", leaf: "#1F8E7A", leafLight: "#2DB59D", flower: "#F0C24B", shape: "tulip" },
  { id: "fern", name: "Moon Fern", tier: "free", earned: true, blurb: "Only grown by gardeners", leaf: "#2C7F86", leafLight: "#4AA7AE", flower: "#C9D9F2", shape: "daisy" },
];

export interface Pot extends Unlockable { body: string; rim: string; stripes?: boolean }

export const POTS: Pot[] = [
  { id: "clay", name: "Clay pot", tier: "free", body: "#D98B5F", rim: "#C27248" },
  { id: "white", name: "White ceramic", tier: "free", body: "#EEF2F1", rim: "#CBD5D3" },
  { id: "teal", name: "Teal glaze", tier: "premium", body: "#2DC4B2", rim: "#1FA595" },
  { id: "gold", name: "Gold leaf", tier: "max", body: "#E3B947", rim: "#C79A2E" },
  { id: "mint", name: "Mint glaze", tier: "free", earned: true, body: "#BFE8DC", rim: "#93D3C1" },
  { id: "stripe", name: "Striped pot", tier: "free", earned: true, body: "#F3D9A4", rim: "#E0BC72", stripes: true },
];

export type Companion = Unlockable;

export const COMPANIONS: Companion[] = [
  { id: "none", name: "None", tier: "free" },
  { id: "ladybug", name: "Ladybug", tier: "premium" },
  { id: "butterfly", name: "Butterfly", tier: "max" },
  { id: "bee", name: "Bumblebee", tier: "free", earned: true },
  { id: "snail", name: "Garden snail", tier: "free", earned: true },
];

/** The free extras a member picks one of at each harvest (matches harvest_fikko in migration 026). */
export const HARVEST_REWARDS = ["mint", "stripe", "bee", "snail"] as const;

/** Seeds unlocked by the number of plants harvested. */
export const GARDENER_SEEDS = [{ at: 3, seed: "fern" }];
/** Every this many harvests earns a free month of Premium (at most one a year). */
export const PREMIUM_EVERY = 3;

/** Item ids unlocked by harvesting: the rewards picked, and seeds earned by garden size. */
export function unlockedItems(garden: { reward: string | null }[]): string[] {
  return [
    ...garden.flatMap((g) => (g.reward ? [g.reward] : [])),
    ...GARDENER_SEEDS.filter((b) => garden.length >= b.at).map((b) => b.seed),
  ];
}

/** Whether the member can use an item: their plan includes it and, for earned items, they've unlocked it. */
export function owns(item: Unlockable, plan: Plan, unlocked: string[]): boolean {
  return planIncludes(plan, item.tier) && (!item.earned || unlocked.includes(item.id));
}

/** Where to find an item the member can't use yet, for its label. */
export function lockedReason(item: Unlockable): string {
  if (!item.earned) return `With ${PLAN_LABEL[item.tier]}`;
  const bonus = GARDENER_SEEDS.find((b) => b.seed === item.id);
  return bonus ? `Grow ${bonus.at} plants` : "Harvest reward";
}

export const seedById = (id: string | null) => SEEDS.find((s) => s.id === id) ?? null;
export const potById = (id: string) => POTS.find((p) => p.id === id) ?? POTS[0];

/** Complete days needed to reach each stage. */
export const STAGES = [
  { name: "Seed", from: 0 },
  { name: "Sprout", from: 3 },
  { name: "Sapling", from: 10 },
  { name: "Budding", from: 21 },
  { name: "Bloom", from: 40 },
] as const;

/** More idle days than this and the plant withers. */
export const WITHER_AFTER = 3;
/** Complete days to reach full bloom, when the plant can be harvested. */
export const BLOOM_DAYS = 40;

/** More idle days than this and the plant dies (unless it has bloomed). */
export const DIE_AFTER = 7;

export type Health = "growing" | "withering" | "dead";

export interface Growth {
  /** Days since planting on which every habit was done. */
  completeDays: number;
  /** Index into STAGES. */
  stage: number;
  /** Days without anything logged, ending yesterday (today is still in progress). */
  idleDays: number;
  health: Health;
  /** Complete days still needed for the next stage, or null when fully grown. */
  toNextStage: number | null;
  /** Progress through the current stage, 0–1. */
  stageProgress: number;
  /** Consecutive complete days, counting back from today (or yesterday while today is unfinished). */
  streak: number;
}

export function stageFor(completeDays: number): number {
  let stage = 0;
  STAGES.forEach((s, i) => { if (completeDays >= s.from) stage = i; });
  return stage;
}

/**
 * The plant's state from the habit log. A complete day is one where every
 * habit counted that day was done; an idle day is one with nothing logged at
 * all. Once a run of idle days since planting goes past DIE_AFTER the plant
 * stays dead, even if the member logs again, until they replant.
 */
export function computeGrowth(data: HabitData, plantedOn: string, waterTarget?: number, today = todayKey()): Growth {
  // A planting day in the future (a changed clock) is treated as today.
  const start = plantedOn > today ? today : plantedOn;
  let completeDays = 0;
  let streak = 0;
  let idleRun = 0;
  let died = false;

  for (let date = start; date <= today; date = shiftDateKey(date, 1)) {
    const isToday = date === today;
    const { done, total } = completion(data, date, waterTarget);
    const complete = total > 0 && done === total;
    if (complete) completeDays++;
    // Today unfinished doesn't break the streak or count as idle yet.
    if (complete) streak++;
    else if (!isToday) streak = 0;

    if (loggedOn(data, date)) idleRun = 0;
    else if (!isToday) {
      idleRun++;
      // A plant that has bloomed can wither but never dies.
      if (idleRun > DIE_AFTER && completeDays < BLOOM_DAYS) died = true;
    }
  }

  const stage = stageFor(completeDays);
  const next = STAGES[stage + 1];
  const from = STAGES[stage].from;
  return {
    completeDays,
    stage,
    idleDays: idleRun,
    health: died ? "dead" : idleRun > WITHER_AFTER ? "withering" : "growing",
    toNextStage: next ? next.from - completeDays : null,
    stageProgress: next ? (completeDays - from) / (next.from - from) : 1,
    streak,
  };
}
