import { useMemo, useState } from "react";
import { ChefHat, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import PageHeader from "./PageHeader";
import { EmptyState } from "./HabitCard";
import RecipeTile from "./recipes/RecipeTile";
import RecipeDetail from "./recipes/RecipeDetail";
import AddRecipeDialog from "./recipes/AddRecipeDialog";
import FeaturedRecipe from "./recipes/FeaturedRecipe";
import RewardsCard from "./recipes/RewardsCard";
import { useRecipes } from "../hooks/useRecipes";
import { RECIPE_TAGS, type Recipe, type RecipeTag } from "../lib/recipes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Source = "all" | "fikko" | "member" | "saved";

/** Mirrors the database's display-name rule, for the "Sharing as" line only. */
function displayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Fikko member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const NOTE_KEY = "fikko.recipes.earlyNoteDismissed";

/** A note to early members about the recipe photos. Stays dismissed on this device once closed. */
function EarlyUsersNote() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(NOTE_KEY) === "1"; } catch { return false; }
  });
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(NOTE_KEY, "1"); } catch { /* private mode: just hide it for now */ }
  };
  return (
    <aside className="fresh-panel relative flex flex-col gap-4 rounded-2xl border border-teal/20 p-5 pr-12 sm:flex-row sm:items-center sm:p-6 sm:pr-14">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80" aria-hidden="true">
        <Sparkles className="size-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Hi early users!</p>
        <p className="mt-1 text-sm text-foreground/75">
          Yes, the images on the Fikko recipes are indeed AI-generated, as we aren&apos;t the best cooks. But hopefully
          you are. Upload your healthy recipes and earn points!
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss note"
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-foreground/60 transition-colors outline-none hover:bg-white/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/80 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export default function RecipesView({ userId, profileName }: { userId: string; profileName: string }) {
  const { recipes, saved, loading, error, setError, toggleSave, create, remove, report, rewards, featured } = useRecipes(userId);
  const [tags, setTags] = useState<RecipeTag[]>([]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);
  const [reporting, setReporting] = useState<Recipe | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const open = recipes.find((r) => r.key === openKey) ?? null;
  const featuredRecipe = featured ? recipes.find((r) => r.key === featured.recipeId) ?? null : null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (source === "saved" && !saved.has(r.key)) return false;
      if ((source === "fikko" || source === "member") && r.source !== source) return false;
      // Every selected tag must match, so each chip narrows the list.
      if (!tags.every((t) => r.tags.includes(t))) return false;
      if (!q) return true;
      return [r.title, r.description, ...r.ingredients].some((s) => s.toLowerCase().includes(q));
    });
  }, [recipes, saved, source, tags, query]);

  const toggleTag = (t: RecipeTag) => setTags((prev) => (prev.includes(t) ? prev.filter((k) => k !== t) : [...prev, t]));
  const filtered = tags.length > 0 || query.trim() !== "" || source !== "all";

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await remove(confirmDelete);
      setConfirmDelete(null);
      setOpenKey(null);
    } catch (err) {
      setError((err as Error).message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    if (!reporting) return;
    setBusy(true);
    try {
      await report(reporting, reportReason);
      setReporting(null);
      setReportReason("");
      setOpenKey(null);
      setNotice("Thanks for letting us know. The recipe is hidden for you, and we'll review it.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recipes"
        subtitle="Healthy ideas from Fikko and the community."
        action={<Button onClick={() => setAdding(true)}><Plus />Share a recipe</Button>}
      />

      <EarlyUsersNote />

      <div className={cn("grid gap-4", featuredRecipe && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
        {featuredRecipe && featured && (
          <FeaturedRecipe recipe={featuredRecipe} saves={featured.saves} onOpen={() => setOpenKey(featuredRecipe.key)} />
        )}
        <RewardsCard rewards={rewards} recipes={recipes} className={cn(!featuredRecipe && "lg:max-w-md")} />
      </div>

      <div className="space-y-4">
        {/* Ingredient and diet tags. One scrolling row on phones, wrapping on larger screens. */}
        <div
          role="group"
          aria-label="Filter by tag"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <Chip selected={tags.length === 0} onClick={() => setTags([])}>All</Chip>
          {RECIPE_TAGS.map((t) => (
            <Chip key={t.key} selected={tags.includes(t.key)} onClick={() => toggleTag(t.key)}>{t.label}</Chip>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes or ingredients"
              aria-label="Search recipes"
              className="h-10 pl-9"
            />
          </div>
          <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
            <TabsList className="h-10! w-full sm:w-auto">
              <TabsTrigger value="all" className="px-3">All</TabsTrigger>
              <TabsTrigger value="fikko" className="px-3">Fikko</TabsTrigger>
              <TabsTrigger value="member" className="px-3">Members</TabsTrigger>
              <TabsTrigger value="saved" className="px-3">Saved{saved.size > 0 && ` (${saved.size})`}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p aria-live="polite">
            {shown.length} {shown.length === 1 ? "recipe" : "recipes"}
            {loading && <Loader2 className="ml-2 inline size-3.5 animate-spin" aria-label="Loading member recipes" />}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => { setTags([]); setQuery(""); setSource("all"); }}
              className="inline-flex items-center gap-1 rounded-md px-1 text-sm hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />Clear filters
            </button>
          )}
        </div>

        {(error || notice) && (
          <p role="status" className={cn("rounded-lg border px-4 py-3 text-sm", error ? "border-destructive/30 text-destructive" : "border-primary/20 bg-primary/5")}>
            {error ?? notice}
            <button type="button" onClick={() => { setError(null); setNotice(null); }} className="ml-3 underline">Dismiss</button>
          </p>
        )}
      </div>

      {shown.length ? (
        <div className="columns-2 gap-3 sm:gap-5 md:columns-3 lg:columns-4 2xl:columns-5">
          {shown.map((r) => (
            <RecipeTile
              key={r.key}
              recipe={r}
              saved={saved.has(r.key)}
              featured={r.key === featuredRecipe?.key}
              onOpen={() => setOpenKey(r.key)}
              onToggleSave={() => void toggleSave(r)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ChefHat}
          title={source === "saved" && !tags.length && !query ? "No saved recipes yet" : "No recipes match"}
          body={
            source === "saved" && !tags.length && !query
              ? "Tap the heart on any recipe to keep it here."
              : source === "member" && !loading && !tags.length && !query
                ? "No member recipes yet. Be the first to share one."
                : "Try removing a tag or searching for something else."
          }
          className="py-16"
        >
          {source === "member" ? <Button onClick={() => setAdding(true)}><Plus />Share a recipe</Button> : undefined}
        </EmptyState>
      )}

      <RecipeDetail
        recipe={open}
        userId={userId}
        saved={open ? saved.has(open.key) : false}
        featured={!!open && open.key === featuredRecipe?.key}
        onClose={() => setOpenKey(null)}
        onToggleSave={() => open && void toggleSave(open)}
        onDelete={() => open && setConfirmDelete(open)}
        onReport={() => open && setReporting(open)}
      />

      <AddRecipeDialog open={adding} onOpenChange={setAdding} sharingAs={displayName(profileName)} onCreate={create} />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this recipe?</DialogTitle>
            <DialogDescription>It will be removed for everyone, along with its photo. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reporting} onOpenChange={(o) => { if (!o) { setReporting(null); setReportReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this recipe</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong. Recipes reported by several members are hidden automatically.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Optional: spam, unsafe advice, not a recipe…"
            aria-label="Reason for report"
          />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={doReport} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
