import { useState } from "react";
import { Check, Crown, Loader2, Star, TreeDeciduous } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FikkoPlant from "./FikkoPlant";
import { COMPANIONS, GARDENER_SEEDS, HARVEST_REWARDS, POTS, seedById } from "../../lib/fikko";
import type { HarvestResult } from "../../hooks/useFikkoGarden";
import { friendlyError } from "../../lib/errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedId: string;
  potId: string;
  companionId: string;
  /** Item ids already unlocked, so owned rewards aren't offered again. */
  unlocked: string[];
  onHarvest: (reward: string | null) => Promise<HarvestResult>;
}

/**
 * Moving a blooming plant to the garden: pick a free extra, see the real tree
 * it plants, then any bonus seed or Premium month the harvest earned.
 */
export default function HarvestDialog({ open, onOpenChange, seedId, potId, companionId, unlocked, onHarvest }: Props) {
  const seed = seedById(seedId);
  const choices = HARVEST_REWARDS.filter((id) => !unlocked.includes(id));
  const [reward, setReward] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HarvestResult | null>(null);

  const bonusSeed = result ? seedById(GARDENER_SEEDS.find((b) => b.at === result.gardenSize)?.seed ?? null) : null;

  function close() {
    if (saving) return;
    onOpenChange(false);
    setReward(null);
    setResult(null);
    setError(null);
  }

  async function claim() {
    if (saving || (choices.length > 0 && !reward)) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await onHarvest(choices.length ? reward : null));
    } catch (e) {
      setError(friendlyError(e, "We couldn't harvest your plant. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-6 sm:max-w-lg">
        {!result ? (
          <>
            <DialogHeader className="items-center text-center">
              <span className="grid size-11 place-items-center rounded-full bg-[#FBF1D6]" aria-hidden="true">
                <Star className="size-5 fill-[#F2B630] text-[#F2B630]" />
              </span>
              <DialogTitle className="text-xl">Move your {seed?.name ?? "plant"} to the garden</DialogTitle>
              <DialogDescription>
                It stays in your garden for good.{choices.length ? " Pick a free extra to keep as your reward." : ""}
              </DialogDescription>
            </DialogHeader>

            {choices.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {choices.map((id) => {
                  const pot = POTS.find((p) => p.id === id);
                  const pal = COMPANIONS.find((c) => c.id === id);
                  const selected = reward === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setReward(id)}
                      aria-pressed={selected}
                      className={cn(
                        "relative flex flex-col items-center rounded-xl border bg-card p-3 pt-2 text-center transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected && "border-primary bg-fikko-tint ring-1 ring-primary hover:bg-fikko-tint",
                      )}
                    >
                      {selected && (
                        <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                          <Check className="size-3" />
                        </span>
                      )}
                      <span className="absolute top-2 right-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {pot ? "Pot" : "Companion"}
                      </span>
                      <FikkoPlant seedId={seedId} stage={4} potId={pot ? id : potId} companionId={pal ? id : "none"} className="max-w-24" />
                      <span className="mt-1 text-sm font-medium">{(pot ?? pal)?.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="flex gap-3 rounded-lg pair-soft p-3 text-sm">
              <TreeDeciduous className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
              <span>
                <span className="block font-medium">A real tree, planted for you</span>
                Every plant you grow to full bloom plants a real tree with our planting partner.
              </span>
            </p>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <Button onClick={claim} disabled={saving || (choices.length > 0 && !reward)} className="h-10 w-full bg-button hover:bg-button-hover">
              {saving && <Loader2 className="animate-spin" />}
              {choices.length ? "Claim reward and harvest" : "Move to my garden"}
            </Button>
          </>
        ) : (
          <>
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-xl">
                {bonusSeed ? `You unlocked the ${bonusSeed.name}` : `Your ${seed?.name ?? "plant"} is in the garden`}
              </DialogTitle>
              <DialogDescription>
                {bonusSeed
                  ? `Growing ${result.gardenSize} plants unlocks a seed only gardeners can grow. It's yours on any plan.`
                  : `That's ${result.gardenSize} ${result.gardenSize === 1 ? "plant" : "plants"} in your garden. Plant your next seed to keep growing.`}
              </DialogDescription>
            </DialogHeader>
            <div className="mx-auto w-40">
              <FikkoPlant seedId={bonusSeed?.id ?? seedId} stage={4} potId={potId} companionId={bonusSeed ? "none" : companionId} />
            </div>
            <p className="flex gap-3 rounded-lg pair-soft p-3 text-sm">
              <TreeDeciduous className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
              <span>
                <span className="block font-medium">Your tree is on its way</span>
                We plant trees in batches with our planting partner. You&apos;ll see it marked as planted in your garden.
              </span>
            </p>
            {result.premiumMonth && (
              <p className="flex gap-3 rounded-lg bg-[#FBF1D6] p-3 text-sm text-ink">
                <Crown className="mt-0.5 size-5 shrink-0 text-[#8A6414]" aria-hidden="true" />
                <span>
                  <span className="block font-medium">Plus a free month of Premium</span>
                  Earned for growing {result.gardenSize} plants. It will be added to your account when Premium launches.
                </span>
              </p>
            )}
            <Button onClick={close} className="h-10 w-full bg-button hover:bg-button-hover">
              Plant my next seed
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
