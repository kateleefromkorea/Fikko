import { ArrowRight, Crown, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import RecipeArt from "./RecipeArt";
import type { Recipe } from "../../lib/recipes";

/** This week's featured member recipe: last week's most-saved. */
export default function FeaturedRecipe({ recipe, saves, onOpen, className }: {
  recipe: Recipe;
  saves: number;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="featured-title"
      className={cn("fresh-panel grid overflow-hidden rounded-2xl border border-teal/20 sm:grid-cols-[minmax(0,15rem)_1fr]", className)}
    >
      {recipe.photoUrl ? (
        <img src={recipe.photoUrl} alt="" className="h-48 w-full object-cover sm:h-full" />
      ) : (
        <RecipeArt art={recipe.art} className="h-48 w-full sm:h-full" />
      )}
      <div className="flex flex-col justify-center gap-3 p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary-ink uppercase">
          <Crown className="size-3.5" aria-hidden="true" />
          Featured this week
        </p>
        <h2 id="featured-title" className="text-2xl font-semibold tracking-tight">{recipe.title}</h2>
        {recipe.description && <p className="line-clamp-2 text-sm text-foreground/70">{recipe.description}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/70">
          <span>By {recipe.authorName}</span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5" aria-hidden="true" />
            Saved by {saves} {saves === 1 ? "member" : "members"} last week
          </span>
        </p>
        <Button onClick={onOpen} className="mt-1 self-start">View recipe <ArrowRight /></Button>
      </div>
    </section>
  );
}
