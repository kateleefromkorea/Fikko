import { createRoot } from "react-dom/client";
import FoodLogModal from "@/components/FoodLogModal";
import { supabase } from "@/lib/supabase";
import "./mobile.css";

(supabase.auth as any).getSession = async () => ({ data: { session: { access_token: "x" } } });
const realFetch = window.fetch;
window.fetch = async (url: any, init?: any) => {
  if (String(url).includes("/api/voice-log")) {
    await new Promise((r) => setTimeout(r, 400));
    return new Response(JSON.stringify({ notUnderstood: null, foods: [
      { meal: "lunch", name: "Hainanese chicken rice", grams: 380, caloriesPer100g: 158, proteinPer100g: 9, carbsPer100g: 20, fatPer100g: 5, estimated: true, portion: { count: 1, unit: "plate", gramsEach: 380, sharedBy: 2 } },
      { meal: "lunch", name: "Kopi peng", grams: 250, caloriesPer100g: 44, proteinPer100g: 1, carbsPer100g: 8, fatPer100g: 1, estimated: false, portion: { count: 1, unit: "cup", gramsEach: 250, sharedBy: 1 } },
    ] }), { status: 200 });
  }
  return realFetch(url, init);
};
createRoot(document.getElementById("root")!).render(
  <FoodLogModal meal="lunch" mealLabel="Lunch" date="2026-10-08" userId={null} items={[]} savedFoods={[]} savedMeals={[]}
    onAdd={() => true} onAddMany={(f) => { console.log("ADDED", JSON.stringify(f)); return true; }} onUpdateGrams={() => {}} onDelete={() => {}} onSaveFood={() => {}}
    onSaveMeal={async () => {}} onDeleteMeal={() => {}} onClose={() => {}} showMacros />,
);
