import { useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { BADGES, EVENT_LABEL, POINT_RULES, earned, type Rewards } from "../../lib/rewards";
import { timeAgo } from "../../lib/community";
import type { Recipe } from "../../lib/recipes";

/** The member's points and badges, with a dialog explaining how to earn more. */
export default function RewardsCard({ rewards, recipes, className }: { rewards: Rewards; recipes: Recipe[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const got = BADGES.filter((b) => earned(b, rewards)).length;
  const titleOf = (id: string | null) => recipes.find((r) => r.key === id)?.title;

  return (
    <section aria-labelledby="rewards-title" className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="rewards-title" className="text-sm text-muted-foreground">Your recipe points</h2>
          <p className="mt-1 font-display text-3xl font-medium">{rewards.points.toLocaleString()}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-primary/8" aria-hidden="true">
          <Trophy className="size-5 text-primary" />
        </span>
      </div>

      <div className="mt-5">
        <p className="text-xs text-muted-foreground">Badges · {got} of {BADGES.length}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const on = earned(b, rewards);
            return (
              <li
                key={b.key}
                title={on ? b.label : `${b.label}: ${b.how}`}
                className={cn(
                  "grid size-10 place-items-center rounded-full border",
                  on ? "border-primary/30 bg-primary/10 text-primary" : "border-dashed text-muted-foreground/50",
                )}
              >
                <b.icon className="size-4.5" aria-hidden="true" />
                <span className="sr-only">{b.label}{on ? " (earned)" : ` (locked: ${b.how})`}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <Button variant="outline" size="sm" className="mt-5 w-full" onClick={() => setOpen(true)}>How points work</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto p-5 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Recipe points and badges</DialogTitle>
            <DialogDescription>
              Points come from other members saving what you share, so a great recipe earns more than lots of quick ones.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Earning points</h3>
            <ul className="space-y-2">
              {POINT_RULES.map((r) => (
                <li key={r.text} className="flex items-start gap-3 text-sm">
                  <span className="w-10 shrink-0 rounded-full bg-primary/10 py-0.5 text-center text-xs font-semibold text-primary tabular-nums">+{r.points}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Saving your own recipe doesn&apos;t count, and points from a save go away if it&apos;s unsaved.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Badges</h3>
            <ul className="space-y-3">
              {BADGES.map((b) => {
                const [have, goal] = b.progress(rewards);
                const on = have >= goal;
                return (
                  <li key={b.key} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full border",
                        on ? "border-primary/30 bg-primary/10 text-primary" : "border-dashed text-muted-foreground/60",
                      )}
                      aria-hidden="true"
                    >
                      <b.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{b.label}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{on ? "Earned" : `${Math.min(have, goal)}/${goal}`}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{b.how}</p>
                      {!on && goal > 1 && <Progress value={(have / goal) * 100} className="mt-1.5 h-1.5" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {rewards.recent.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Recent points</h3>
              <ul className="divide-y rounded-lg border">
                {rewards.recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{EVENT_LABEL[e.kind]}</span>
                      {titleOf(e.recipeId) && <span className="block truncate text-xs text-muted-foreground">{titleOf(e.recipeId)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                    <span className="w-10 text-right font-semibold text-primary tabular-nums">+{e.points}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
