// /admin#recipes: recipes members share wait here until an admin approves
// them (migration 033). Approved recipes that get reported come back too.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { tagLabel, type RecipeTag } from "../lib/recipes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface ReviewRecipe {
  id: string;
  title: string;
  description: string;
  tags: RecipeTag[];
  contains: string[] | null;
  ingredients: string[];
  steps: string[];
  minutes: number | null;
  servings: number | null;
  calories: number | null;
  photo_path: string | null;
  author_name: string;
  author_email: string | null;
  author_approved: number;
  created_at: string;
  review_status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  hidden: boolean;
  reports: { reason: string | null; created_at: string }[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function RecipeReview() {
  const [queue, setQueue] = useState<ReviewRecipe[] | null>(null);
  const [recent, setRecent] = useState<ReviewRecipe[]>([]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("admin_recipe_queue");
    if (error) return setError("Couldn't load recipes for review. Has migration 033 been run?");
    const { queue, recent } = data as { queue: ReviewRecipe[]; recent: ReviewRecipe[] };
    const paths = queue.map((r) => r.photo_path).filter((p): p is string => !!p);
    if (paths.length) {
      const signed = await supabase.storage.from("recipe-photos").createSignedUrls(paths, 60 * 60);
      const urls = new Map<string, string>();
      for (const d of signed.data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
      setPhotos(urls);
    }
    setQueue(queue);
    setRecent(recent);
    setError(null);
  };

  useEffect(() => { void load(); }, []);

  async function decide(id: string, decision: "approve" | "reject", note?: string) {
    setBusy(id);
    const { error } = await supabase.rpc("admin_recipe_decide", { p_recipe: id, p_decision: decision, p_note: note ?? null });
    setBusy(null);
    if (error) return setError("Couldn't save that decision. Try again.");
    await load();
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!queue) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Recipe review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {queue.length === 0
            ? "Nothing to review. New recipes from members will appear here."
            : `${queue.length} to review. Members only see a recipe once it's approved; its author sees your note if you reject it.`}
        </p>
      </div>

      {queue.map((r) => (
        <ReviewCard key={r.id} recipe={r} photo={r.photo_path ? photos.get(r.photo_path) : undefined} busy={busy === r.id} onDecide={decide} />
      ))}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently reviewed</CardTitle>
            <CardDescription>Changed your mind? Switch a decision here.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {r.title}
                      <Badge variant={r.review_status === "approved" ? "default" : "destructive"}>
                        {r.review_status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By {r.author_name} · {r.reviewed_at && when(r.reviewed_at)}
                      {r.review_note && ` · "${r.review_note}"`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => decide(r.id, r.review_status === "approved" ? "reject" : "approve")}
                  >
                    {r.review_status === "approved" ? "Reject instead" : "Approve instead"}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ReviewCard({
  recipe: r, photo, busy, onDecide,
}: {
  recipe: ReviewRecipe;
  photo?: string;
  busy: boolean;
  onDecide: (id: string, decision: "approve" | "reject", note?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const facts = [
    r.minutes != null && `${r.minutes} min`,
    r.servings != null && `serves ${r.servings}`,
    r.calories != null && `${r.calories} kcal per serving`,
  ].filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {r.title}
          {r.review_status === "pending" ? (
            <Badge variant="secondary">New</Badge>
          ) : (
            <Badge variant="destructive">Reported {r.reports.length}×{r.hidden ? " · hidden" : ""}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          By {r.author_name}{r.author_email ? ` (${r.author_email})` : ""} · {when(r.created_at)} ·{" "}
          {r.author_approved === 0 ? "first recipe" : `${r.author_approved} approved before`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          {photo && <img src={photo} alt="" className="w-full rounded-lg bg-muted object-cover sm:size-40 sm:shrink-0" />}
          <div className="min-w-0 space-y-2">
            {r.description && <p>{r.description}</p>}
            {facts.length > 0 && <p className="text-muted-foreground">{facts.join(" · ")}</p>}
            {r.tags.length > 0 && <p className="text-muted-foreground">Tags: {r.tags.map(tagLabel).join(", ")}</p>}
            <p className="text-muted-foreground">
              Contains: {r.contains === null ? "not listed" : r.contains.length ? r.contains.join(", ") : "none of the listed allergens"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Ingredients</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.ingredients.map((i, n) => <li key={n}>{i}</li>)}</ul>
          </div>
          <div>
            <p className="font-medium">Steps</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
          </div>
        </div>

        {r.reports.length > 0 && (
          <div className="rounded-lg bg-destructive/8 px-3 py-2">
            <p className="font-medium text-destructive">Reports</p>
            <ul className="mt-1 space-y-0.5">
              {r.reports.map((rep, n) => (
                <li key={n}>{rep.reason || <span className="text-muted-foreground">No reason given</span>} · <span className="text-muted-foreground">{when(rep.created_at)}</span></li>
              ))}
            </ul>
          </div>
        )}

        {rejecting ? (
          <div className="space-y-2">
            <label htmlFor={`note-${r.id}`} className="font-medium">Note for the author (optional)</label>
            <Textarea
              id={`note-${r.id}`}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: The photo isn't of the dish. Please share it again with your own photo."
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => onDecide(r.id, "reject", note)}>Reject</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide(r.id, "approve")}>
              {r.review_status === "pending" ? "Approve" : "Keep it up"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
              {r.review_status === "pending" ? "Reject…" : "Take it down…"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
