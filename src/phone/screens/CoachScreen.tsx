import { Suspense, lazy } from "react";
import CoachView from "@/components/CoachView";
import ScreenTitle, { Segmented } from "@/phone/ScreenTitle";

const RecipesView = lazy(() => import("@/components/RecipesView"));

export type CoachPane = "coach" | "recipes";

/**
 * The AI coach and recipes under one tab: both answer "what should I do or
 * eat next?". A question sent from Progress arrives as `draft`.
 */
export default function CoachScreen({ view, onView, profileName, draft, userId, diets, allergies }: {
  view: CoachPane;
  onView: (v: CoachPane) => void;
  profileName: string;
  draft: string;
  userId: string;
  diets: string[];
  allergies: string[];
}) {
  return (
    <div className={view === "coach" ? "screen-in coach-screen" : "screen-in"}>
      <ScreenTitle>Coach</ScreenTitle>
      <Segmented
        label="Coach or recipes"
        value={view}
        onChange={onView}
        options={[{ id: "coach", label: "Ask Fikko" }, { id: "recipes", label: "Recipes" }]}
      />
      {view === "coach" && (
        // mobile.css pins the message box above the tab bar, as in a messaging app.
        <div className="coach-mobile">
          <CoachView key={draft} profileName={profileName} initialDraft={draft} />
        </div>
      )}
      {view === "recipes" && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading recipes…</p>}>
          <RecipesView userId={userId} profileName={profileName} diets={diets} allergies={allergies} />
        </Suspense>
      )}
    </div>
  );
}
