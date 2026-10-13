import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayKey } from "../lib/dates";

/** A plant the member grew to full bloom and harvested (migration 026). */
export interface GardenPlant {
  id: string;
  seed: string;
  pot: string;
  companion: string;
  plantedOn: string;
  harvestedOn: string;
  completeDays: number;
  reward: string | null;
  premiumMonth: boolean;
  /** A real tree for this plant is for Max members: `none` for anyone else (migration 039). */
  treeStatus: "none" | "pending" | "planted";
}

export interface HarvestResult {
  premiumMonth: boolean;
  gardenSize: number;
  /** A real tree is owed for this harvest (the member is on Max). */
  realTree: boolean;
}

export function useFikkoGarden(userId: string | null) {
  const [garden, setGarden] = useState<GardenPlant[]>([]);

  async function load() {
    if (!userId) {
      setGarden([]);
      return;
    }
    const { data } = await supabase
      .from("fikko_garden")
      .select("id, seed, pot, companion, planted_on, harvested_on, complete_days, reward, tree_status, premium_month")
      .eq("user_id", userId)
      .order("created_at");
    // A database without migration 026 yet returns an error: show an empty garden.
    setGarden(
      (data ?? []).map((r) => ({
        id: r.id,
        seed: r.seed,
        pot: r.pot,
        companion: r.companion,
        plantedOn: r.planted_on,
        harvestedOn: r.harvested_on,
        completeDays: r.complete_days,
        reward: r.reward,
        premiumMonth: r.premium_month,
        treeStatus: r.tree_status,
      })),
    );
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Moves the blooming plant into the garden. The database checks it has
   * bloomed, records the reward and, for a member on Max, the real tree owed, and
   * empties the pot.
   */
  async function harvest(completeDays: number, reward: string | null): Promise<HarvestResult> {
    const { data, error } = await supabase.rpc("harvest_fikko", {
      p_today: todayKey(),
      p_complete_days: completeDays,
      p_reward: reward,
    });
    if (error) throw new Error("We couldn't move your plant to the garden. Please try again.");
    const row = (Array.isArray(data) ? data[0] : data) as { premium_month: boolean; garden_size: number; real_tree: boolean };
    await load();
    return { premiumMonth: row.premium_month, gardenSize: row.garden_size, realTree: row.real_tree === true };
  }

  return { garden, harvest };
}
