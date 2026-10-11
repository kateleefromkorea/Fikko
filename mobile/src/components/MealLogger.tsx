import FoodLogModal from "@/components/FoodLogModal";
import { MEALS } from "@/components/HabitsView";
import { useCustomFoods } from "@/hooks/useCustomFoods";
import type { useFoodLog } from "@/hooks/useFoodLog";
import { useSavedMeals } from "@/hooks/useSavedMeals";
import type { MealKey } from "@/types";

/**
 * The website's meal window (describe, photo, barcode, search, recent and
 * saved meals), opened straight from the capture sheet or a Today row
 * instead of from inside the Calories card. On the phone it rises as a sheet.
 */
export default function MealLogger({ meal, onClose, date, userId, foodLog, showMacros }: {
  meal: MealKey | null;
  onClose: () => void;
  date: string;
  userId: string | null;
  foodLog: ReturnType<typeof useFoodLog>;
  showMacros: boolean;
}) {
  const customFoods = useCustomFoods(userId);
  const savedMeals = useSavedMeals(userId);
  if (!meal) return null;
  return (
    <FoodLogModal
      meal={meal}
      mealLabel={MEALS.find((m) => m.key === meal)!.label}
      date={date}
      userId={userId}
      items={foodLog.items.filter((i) => i.meal === meal)}
      savedFoods={customFoods.foods}
      savedMeals={savedMeals.meals}
      onAdd={(food) => foodLog.addItem(meal, food)}
      onAddMany={(foods) => foodLog.addItems(meal, foods)}
      onUpdateGrams={foodLog.updateGrams}
      onDelete={foodLog.deleteItem}
      onDeleteMany={foodLog.deleteItems}
      onSaveFood={customFoods.saveFood}
      onSaveMeal={savedMeals.saveMeal}
      onDeleteMeal={savedMeals.deleteMeal}
      onClose={() => { onClose(); foodLog.clearError(); }}
      showMacros={showMacros}
      error={foodLog.error}
    />
  );
}
