// Common supplements and medications, suggested as members type in the
// Medications card so they rarely need to spell a name out. Generic names,
// plus a few household brand names people search by.

export const COMMON_MEDICATIONS = [
  // Vitamins
  "Multivitamin", "Vitamin A", "Vitamin B complex", "Vitamin B12", "Vitamin B6", "Vitamin C", "Vitamin D3",
  "Vitamin E", "Vitamin K2", "Folic acid", "Biotin", "Prenatal vitamin",
  // Minerals
  "Calcium", "Iron", "Magnesium", "Magnesium glycinate", "Potassium", "Zinc", "Selenium", "Iodine",
  // Other supplements
  "Fish oil (omega-3)", "Probiotic", "Collagen", "Creatine", "Protein powder", "Melatonin", "Ashwagandha",
  "Turmeric", "Ginkgo biloba", "Ginseng", "Garlic", "St John's wort", "5-HTP", "CoQ10", "Glucosamine",
  "Red yeast rice", "Fibre (psyllium)", "Electrolytes", "Elderberry", "Apple cider vinegar",
  // Common medications
  "Aspirin", "Ibuprofen", "Paracetamol (acetaminophen)", "Naproxen", "Antihistamine", "Cetirizine", "Loratadine",
  "Omeprazole", "Pantoprazole", "Antacid", "Levothyroxine", "Metformin", "Atorvastatin", "Rosuvastatin",
  "Simvastatin", "Lisinopril", "Losartan", "Amlodipine", "Spironolactone", "Warfarin", "Clopidogrel",
  "Sertraline", "Escitalopram", "Fluoxetine", "Birth control pill", "Inhaler", "Insulin",
];

/**
 * Up to `limit` suggestions for what's been typed: names that start with it
 * first, then names with a later word that does ("d3" finds "Vitamin D3").
 */
export function suggestMedications(query: string, exclude: Set<string>, extra: string[] = [], limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const pool = [...extra, ...COMMON_MEDICATIONS].filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key) || exclude.has(key) || key === q) return false;
    seen.add(key);
    return key.split(/[\s(]+/).some((w) => w.startsWith(q)) || key.startsWith(q);
  });
  const starts = pool.filter((n) => n.toLowerCase().startsWith(q));
  return [...starts, ...pool.filter((n) => !starts.includes(n))].slice(0, limit);
}
