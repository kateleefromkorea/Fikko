import { Clock, Flame, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import RecipeArt, { shapeFor } from "./RecipeArt";
import { tagLabel, type Recipe } from "../../lib/recipes";

/** One pinboard tile: picture on top, title and a few facts underneath. */
export default function RecipeTile({
  recipe, saved, onOpen, onToggleSave,
}: {
  recipe: Recipe;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
  return (
    <article className="relative mb-4 break-inside-avoid sm:mb-6">
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="overflow-hidden rounded-2xl ring-1 ring-foreground/5 transition-[filter,box-shadow] duration-200 group-hover:shadow-lg group-hover:shadow-foreground/10 group-hover:brightness-[0.97]">
          {recipe.photoUrl ? (
            <img src={recipe.photoUrl} alt="" loading="lazy" className="block max-h-[26rem] w-full bg-muted object-cover" />
          ) : (
            <RecipeArt art={recipe.art} className={cn("w-full", shapeFor(recipe.key))} />
          )}
        </div>
        <div className="space-y-1 px-1 pt-2.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{recipe.title}</h3>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {recipe.minutes != null && (
              <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />{recipe.minutes} min</span>
            )}
            {recipe.calories != null && (
              <span className="inline-flex items-center gap-1"><Flame className="size-3" aria-hidden="true" />{recipe.calories} kcal</span>
            )}
            {recipe.tags[0] && <span>{tagLabel(recipe.tags[0])}</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground/80">
            {recipe.source === "fikko" ? "Fikko recipe" : `By ${recipe.authorName}`}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onToggleSave}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${recipe.title} from saved` : `Save ${recipe.title}`}
        className="absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-colors outline-none hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Heart className={cn("size-4", saved ? "fill-primary text-primary" : "text-foreground/70")} aria-hidden="true" />
      </button>
    </article>
  );
}
