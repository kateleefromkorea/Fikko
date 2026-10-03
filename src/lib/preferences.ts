import { Calculator, Camera, Hash, type LucideIcon } from "lucide-react";

// The options members pick in onboarding and can change in Profile, and how
// their diet and allergies decide which recipes clash.

export const DIET_PATTERNS = [
  "Omnivore", "Keto", "Low-carb", "Plant-based / Vegan",
  "Vegetarian", "Mediterranean", "Halal", "Gluten-free",
];

/** How many dietary patterns a member can pick. Must match migration 019. */
export const MAX_DIET_PATTERNS = 3;

/** A member's dietary patterns, falling back to the single one older profiles have. */
export function dietsOf(p: { dietary_patterns?: string[] | null; dietary_pattern?: string | null }): string[] {
  if (p.dietary_patterns?.length) return p.dietary_patterns;
  return p.dietary_pattern ? [p.dietary_pattern] : [];
}

/**
 * The more specific aims a member can pick under some goals. Saved as keys in
 * profiles.goal_focus, for personalisation (tracking style, the coach) and
 * health insights.
 */
export const GOAL_FOCUS: Record<string, { key: string; label: string }[]> = {
  nutrition: [
    { key: "more_protein", label: "Eat more protein" },
    { key: "fewer_carbs", label: "Cut down on carbs" },
    { key: "less_fat", label: "Cut down on fat" },
    { key: "supplements", label: "Track daily supplements" },
  ],
  chronic: [
    { key: "sleep", label: "Better sleep" },
    { key: "mood", label: "Improved mood" },
    { key: "stress", label: "Less stress" },
    { key: "energy", label: "More energy" },
    { key: "heart", label: "Heart health" },
  ],
};

export const focusLabel = (key: string) =>
  Object.values(GOAL_FOCUS).flat().find((f) => f.key === key)?.label ?? key;

/** Focus areas that mean the member wants protein, carbs and fat broken out. */
const MACRO_FOCUS = ["more_protein", "fewer_carbs", "less_fat"];

/** The tracking style onboarding sets: macros for members aiming at a macro, otherwise just calories. */
export const inferredTrackingStyle = (focus: string[]) =>
  focus.some((f) => MACRO_FOCUS.includes(f)) ? "Detailed macros" : "Simple calories";

/** Allergy choices as shown to members. "None" clears the rest. */
export const ALLERGY_CHOICES = ["Dairy", "Nuts", "Shellfish", "Soy", "Eggs", "None"];

export type Allergen = "dairy" | "eggs" | "gluten" | "nuts" | "shellfish" | "soy";

/** Allergens a recipe can be marked as containing. Must match migration 011. */
export const ALLERGENS: { key: Allergen; label: string }[] = [
  { key: "dairy", label: "Dairy" },
  { key: "eggs", label: "Eggs" },
  { key: "gluten", label: "Gluten" },
  { key: "nuts", label: "Nuts" },
  { key: "shellfish", label: "Shellfish" },
  { key: "soy", label: "Soy" },
];

export const allergenLabel = (k: Allergen) => ALLERGENS.find((a) => a.key === k)?.label ?? k;

export const TRACKING_STYLES: { key: string; icon: LucideIcon; description: string; soon?: boolean }[] = [
  { key: "Detailed macros", icon: Calculator, description: "Protein, carbs and fats broken out for every meal" },
  { key: "Simple calories", icon: Hash, description: "Just the calorie total. Quick to log, easy to keep up" },
  { key: "Visual meals", icon: Camera, description: "Log meals by photo and portion. Coming soon; works like simple calories for now", soon: true },
];

export const tracksMacros = (style: string | null | undefined) => style === "Detailed macros";

interface RecipeLike {
  tags: string[];
  /** Allergens the recipe contains, or null when not listed. */
  contains?: Allergen[] | null;
}

const MEAT_OR_FISH = ["chicken", "beef", "pork", "fish"];

/**
 * Why a recipe doesn't suit a member, or null if it's fine. Only firm
 * restrictions hide a recipe: a diet that rules an ingredient out, or an
 * allergy. Preferences like keto or Mediterranean don't hide anything.
 * A recipe whose allergens aren't listed is never hidden for allergies; the
 * recipe itself says they aren't listed.
 */
export function recipeClash(recipe: RecipeLike, diets: string[] | null | undefined, allergies: string[] | null | undefined): string | null {
  const contains = recipe.contains ?? [];
  const has = (a: Allergen) => contains.includes(a);
  const follows = (d: string) => (diets ?? []).includes(d);

  if (follows("Vegetarian") && recipe.tags.some((t) => MEAT_OR_FISH.includes(t))) return "Not vegetarian";
  if (follows("Plant-based / Vegan")) {
    if (recipe.tags.some((t) => MEAT_OR_FISH.includes(t))) return "Not vegan";
    if (has("dairy") || has("eggs")) return "Not vegan";
  }
  if (follows("Halal") && recipe.tags.includes("pork")) return "Contains pork";
  if (follows("Gluten-free") && has("gluten")) return "Contains gluten";

  for (const a of allergies ?? []) {
    const key = a.toLowerCase() as Allergen;
    if (has(key)) return `Contains ${a.toLowerCase()}`;
  }
  return null;
}
