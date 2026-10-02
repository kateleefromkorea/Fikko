import { useState } from "react";
import { Clock, Crown, Flag, Flame, Heart, MoreHorizontal, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import RecipeArt from "./RecipeArt";
import { tagLabel, type Recipe } from "../../lib/recipes";
import { allergenLabel } from "../../lib/preferences";
import { timeAgo } from "../../lib/community";

/** Ingredients to tick off while shopping or cooking. Keyed by recipe, so ticks reset per recipe. */
function IngredientList({ items }: { items: string[] }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  return (
    <ul className="space-y-2.5">
      {items.map((ing, i) => (
        <li key={i}>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={ticked.has(i)}
              onCheckedChange={(c) =>
                setTicked((prev) => {
                  const next = new Set(prev);
                  if (c) next.add(i);
                  else next.delete(i);
                  return next;
                })
              }
            />
            <span className={cn(ticked.has(i) && "text-muted-foreground line-through")}>{ing}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The full recipe: picture, facts, ingredients to tick off, and the method. */
export default function RecipeDetail({
  recipe, userId, saved, featured, clash, onClose, onToggleSave, onDelete, onReport,
}: {
  recipe: Recipe | null;
  userId: string;
  saved: boolean;
  featured?: boolean;
  clash?: string | null;
  onClose: () => void;
  onToggleSave: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const r = recipe;
  const own = r?.source === "member" && r.userId === userId;

  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="block max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
        {r && (
          <>
            {r.photoUrl ? (
              <img src={r.photoUrl} alt="" className="block max-h-[22rem] w-full bg-muted object-cover" />
            ) : (
              <RecipeArt art={r.art} className="aspect-[16/7] w-full" iconClassName="size-20" />
            )}

            <div className="space-y-8 p-5 sm:p-8">
              <div className="space-y-3">
                {r.tags.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <li key={t} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">{tagLabel(t)}</li>
                    ))}
                  </ul>
                )}
                <DialogTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">{r.title}</DialogTitle>
                <DialogDescription className="text-base">
                  {r.description || (r.source === "fikko" ? "A Fikko recipe." : "Shared by a Fikko member.")}
                </DialogDescription>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {r.source === "fikko" ? "Fikko recipe" : `Shared by ${r.authorName}${r.createdAt ? ` · ${timeAgo(r.createdAt)}` : ""}`}
                  {r.source === "member" && (r.saves ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1">· <Heart className="size-3.5" aria-hidden="true" />Saved by {r.saves} {r.saves === 1 ? "member" : "members"}</span>
                  )}
                </p>
                {featured && (
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    <Crown className="size-3.5" aria-hidden="true" />Featured recipe of the week
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={onToggleSave} variant={saved ? "default" : "outline"} aria-pressed={saved}>
                  <Heart className={cn(saved && "fill-current")} />
                  {saved ? "Saved" : "Save"}
                </Button>
                {r.source === "member" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="More options"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {own ? (
                        <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />Delete recipe</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={onReport}><Flag />Report recipe</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {(r.minutes != null || r.servings != null || r.calories != null) && (
                <dl className="grid grid-cols-3 divide-x rounded-xl border text-center">
                  {[
                    { icon: Clock, label: "Time", value: r.minutes != null ? `${r.minutes} min` : "—" },
                    { icon: Users, label: "Serves", value: r.servings ?? "—" },
                    { icon: Flame, label: "Per serving", value: r.calories != null ? `${r.calories} kcal` : "—" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="px-2 py-3">
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden="true" />{label}
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {r.macros && (
                <div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Protein", value: r.macros.protein },
                      { label: "Carbs", value: r.macros.carbs },
                      { label: "Fat", value: r.macros.fat },
                    ].map((m) => (
                      <div key={m.label} className="rounded-lg bg-muted px-3 py-2">
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <p className="font-semibold tabular-nums">{m.value} g</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Approximate, per serving.</p>
                </div>
              )}

              <section className="space-y-3">
                <h3 className="text-lg font-semibold">Ingredients</h3>
                {clash && (
                  <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {clash}, so it doesn&apos;t fit the diet or allergies in your preferences.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {r.contains == null
                    ? "Allergens not listed. Check the ingredients."
                    : r.contains.length
                      ? `Contains: ${r.contains.map(allergenLabel).join(", ")}. Check labels on packaged ingredients too.`
                      : "No dairy, eggs, gluten, nuts, shellfish or soy in the ingredients as listed. Check labels on packaged ingredients like stock or sauces."}
                </p>
                <IngredientList key={r.key} items={r.ingredients} />
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold">Method</h3>
                <ol className="space-y-4">
                  {r.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                      <p className="pt-0.5 leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
