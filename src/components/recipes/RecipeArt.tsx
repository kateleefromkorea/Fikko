import {
  Bean, Beef, Carrot, Cherry, CookingPot, Croissant, Drumstick, Egg, EggFried, Fish, Ham, Leaf, Salad, Sandwich,
  Shrimp, Soup, Wheat, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipeArtKey } from "../../lib/recipes";

// Recipes without a photo get a soft illustrated tile: a tint and an icon for
// the main ingredient. The tints are steps of the Fikko green scale in
// index.css, each icon dark enough to read on its tint.
const TONES = {
  honey: { bg: "#EEF4E8", fg: "#3E7A49" },
  coral: { bg: "#E2EDDA", fg: "#165F39" },
  sky:   { bg: "#DCE9D3", fg: "#094217" },
  mint:  { bg: "#E6F0E3", fg: "#165F39" },
  lilac: { bg: "#E9EFE6", fg: "#042509" },
  lemon: { bg: "#F1F6EA", fg: "#3E7A49" },
} as const;

const ART: Record<RecipeArtKey, { icon: LucideIcon; tone: keyof typeof TONES }> = {
  chicken:      { icon: Drumstick,  tone: "honey" },
  wrap:         { icon: Sandwich,   tone: "honey" },
  curry:        { icon: CookingPot, tone: "honey" },
  beef:         { icon: Beef,       tone: "coral" },
  stew:         { icon: Soup,       tone: "coral" },
  pork:         { icon: Ham,        tone: "coral" },
  noodles:      { icon: Soup,       tone: "honey" },
  salad:        { icon: Salad,      tone: "mint" },
  fish:         { icon: Fish,       tone: "sky" },
  taco:         { icon: Fish,       tone: "sky" },
  shrimp:       { icon: Shrimp,     tone: "sky" },
  egg:          { icon: Egg,        tone: "lemon" },
  "egg-pan":    { icon: EggFried,   tone: "lemon" },
  oats:         { icon: Wheat,      tone: "lilac" },
  cherry:       { icon: Cherry,     tone: "lilac" },
  pancake:      { icon: Croissant,  tone: "lilac" },
  "stew-green": { icon: Soup,       tone: "mint" },
  pasta:        { icon: Bean,       tone: "mint" },
  tofu:         { icon: Leaf,       tone: "mint" },
  bowl:         { icon: Bean,       tone: "mint" },
  veg:          { icon: Carrot,     tone: "mint" },
};

// Tiles alternate between a few heights so the grid staggers like a pinboard.
const SHAPES = ["aspect-[4/5]", "aspect-square", "aspect-[3/4]", "aspect-[5/4]", "aspect-[2/3]"];

export function shapeFor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHAPES[h % SHAPES.length];
}

export default function RecipeArt({ art, className, iconClassName }: { art?: RecipeArtKey; className?: string; iconClassName?: string }) {
  const { icon: Icon, tone } = ART[art ?? "veg"] ?? ART.veg;
  const { bg, fg } = TONES[tone];
  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden", className)}
      style={{
        background: `radial-gradient(circle at 30% 20%, white 0%, transparent 55%), ${bg}`,
      }}
      aria-hidden="true"
    >
      {/* A large faint echo of the icon behind the main one gives the tile some depth. */}
      <Icon className="absolute -right-[12%] -bottom-[12%] size-[60%] opacity-[0.07]" style={{ color: fg }} strokeWidth={1.25} />
      <Icon className={cn("size-12", iconClassName)} style={{ color: fg }} strokeWidth={1.5} />
    </div>
  );
}
