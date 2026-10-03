// Fikko's built-in list of well-established supplement and medication
// interactions, checked before any AI is involved. Each group matches the
// names members type (generic names and a few common brands); each rule pairs
// two groups. Keep the wording cautious and plain: it's a prompt to talk to a
// pharmacist, never a reason to stop something prescribed.

export type Severity = "avoid" | "caution" | "timing" | "overlap";

export interface Finding {
  /** The member's own names for the two items. */
  items: [string, string];
  severity: Severity;
  advice: string;
  source: "list" | "ai";
}

const GROUPS: Record<string, RegExp> = {
  iron: /\b(iron|ferrous|ferric|feroglobin|floradix)\b/,
  calcium: /\b(calcium|tums|caltrate|citracal)\b/,
  magnesium: /\b(magnesium)\b/,
  zinc: /\b(zinc)\b/,
  antacid: /\b(antacids?|tums|rennie|gaviscon|maalox|mylanta)\b/,
  ppi: /\b(omeprazole|esomeprazole|lansoprazole|pantoprazole|rabeprazole|nexium|prilosec)\b/,
  quinoloneTetracycline: /\b(ciprofloxacin|levofloxacin|moxifloxacin|doxycycline|tetracycline|minocycline|lymecycline)\b/,
  levothyroxine: /\b(levothyroxine|thyroxine|synthroid|euthyrox|eltroxin|levoxyl|tirosint)\b/,
  biotin: /\b(biotin|vitamin b7)\b/,
  warfarin: /\b(warfarin|coumadin|jantoven)\b/,
  vitaminK: /\b(vitamin k\d?|phylloquinone|menaquinone)\b/,
  fishOil: /\b(fish oil|omega[ -]?3|krill oil|cod liver oil)\b/,
  ginkgo: /\b(ginkgo)\b/,
  garlic: /\b(garlic)\b/,
  turmeric: /\b(turmeric|curcumin)\b/,
  vitaminE: /\b(vitamin e)\b/,
  antiplatelet: /\b(aspirin|clopidogrel|plavix|ticagrelor|prasugrel)\b/,
  nsaid: /\b(ibuprofen|naproxen|advil|motrin|aleve|nurofen|diclofenac)\b/,
  stJohnsWort: /\b(st\.? ?john'?s'? ?wort|hypericum)\b/,
  serotonergic: /\b(sertraline|zoloft|fluoxetine|prozac|citalopram|celexa|escitalopram|lexapro|paroxetine|paxil|venlafaxine|effexor|duloxetine|cymbalta|tramadol)\b/,
  serotoninSupplement: /\b(5[- ]?htp|tryptophan|same|s-adenosyl)\b/,
  contraceptive: /\b(birth control|contraceptive|the pill|combined pill|mini ?pill|yasmin|microgynon|levonorgestrel|norethisterone|desogestrel)\b/,
  potassium: /\b(potassium)\b/,
  potassiumRaising: /\b(lisinopril|enalapril|ramipril|perindopril|captopril|losartan|valsartan|candesartan|irbesartan|telmisartan|olmesartan|spironolactone|eplerenone|amiloride)\b/,
  bisphosphonate: /\b(alendronate|alendronic|risedronate|ibandronate|fosamax|actonel)\b/,
  statin: /\b(atorvastatin|simvastatin|rosuvastatin|pravastatin|lovastatin|lipitor|crestor|zocor)\b/,
  redYeastRice: /\b(red yeast rice|monacolin)\b/,
  multivitamin: /\b(multi[- ]?vitamins?|prenatal|centrum)\b/,
  vitaminA: /\b(vitamin a|retinol)\b/,
  vitaminD: /\b(vitamin d\d?|cholecalciferol|ergocalciferol)\b/,
};

type Rule = [string, string, Severity, string];

const BLEEDING = "Both can thin the blood or affect clotting, so together they may raise the risk of bruising or bleeding. Check with your doctor or pharmacist before taking them together.";
const SEROTONIN = "Both raise serotonin. Together they can cause serotonin syndrome, which can be serious. Don't combine them without your doctor's say-so.";
const BINDS_ANTIBIOTIC = "These minerals bind to some antibiotics and stop them working properly. Take the antibiotic at least 2 hours before, or 4 to 6 hours after.";

const RULES: Rule[] = [
  ["iron", "calcium", "timing", "Calcium reduces how much iron you absorb. Take them at least 2 hours apart."],
  ["iron", "antacid", "timing", "Antacids reduce how much iron you absorb. Take them at least 2 hours apart."],
  ["iron", "ppi", "caution", "Acid-reducing medicines can lower how much iron you absorb over time. Your doctor may want to check your iron levels."],
  ["iron", "zinc", "timing", "Iron and zinc compete to be absorbed. Taking them a couple of hours apart helps you get the most from each."],
  ["iron", "quinoloneTetracycline", "timing", BINDS_ANTIBIOTIC],
  ["calcium", "quinoloneTetracycline", "timing", BINDS_ANTIBIOTIC],
  ["magnesium", "quinoloneTetracycline", "timing", BINDS_ANTIBIOTIC],
  ["zinc", "quinoloneTetracycline", "timing", BINDS_ANTIBIOTIC],
  ["antacid", "quinoloneTetracycline", "timing", BINDS_ANTIBIOTIC],
  ["levothyroxine", "calcium", "timing", "Calcium can stop levothyroxine being absorbed. Take them at least 4 hours apart."],
  ["levothyroxine", "iron", "timing", "Iron can stop levothyroxine being absorbed. Take them at least 4 hours apart."],
  ["levothyroxine", "magnesium", "timing", "Magnesium can reduce how much levothyroxine you absorb. Take them at least 4 hours apart."],
  ["levothyroxine", "antacid", "timing", "Antacids can reduce how much levothyroxine you absorb. Take them at least 4 hours apart."],
  ["levothyroxine", "biotin", "caution", "Biotin can make thyroid blood tests read wrongly. Tell your doctor you take it; many suggest pausing it for a few days before a blood test."],
  ["bisphosphonate", "calcium", "timing", "Calcium stops this bone medicine being absorbed. Take the medicine first, as directed, and calcium later in the day."],
  ["bisphosphonate", "magnesium", "timing", "Magnesium stops this bone medicine being absorbed. Take the medicine first, as directed, and magnesium later in the day."],
  ["bisphosphonate", "iron", "timing", "Iron stops this bone medicine being absorbed. Take the medicine first, as directed, and iron later in the day."],
  ["warfarin", "vitaminK", "avoid", "Vitamin K directly changes how warfarin works. Don't start, stop or change vitamin K without talking to whoever manages your warfarin."],
  ["warfarin", "stJohnsWort", "avoid", "St John's wort can make warfarin work less well. Don't combine them without your doctor's say-so."],
  ["warfarin", "fishOil", "caution", BLEEDING],
  ["warfarin", "ginkgo", "caution", BLEEDING],
  ["warfarin", "garlic", "caution", BLEEDING],
  ["warfarin", "turmeric", "caution", BLEEDING],
  ["warfarin", "vitaminE", "caution", BLEEDING],
  ["warfarin", "nsaid", "avoid", "Anti-inflammatory painkillers with warfarin raise the risk of serious bleeding. Ask your pharmacist about a safer painkiller."],
  ["warfarin", "antiplatelet", "caution", BLEEDING],
  ["antiplatelet", "ginkgo", "caution", BLEEDING],
  ["antiplatelet", "fishOil", "caution", BLEEDING],
  ["antiplatelet", "nsaid", "caution", "Together these raise the risk of stomach irritation and bleeding. Check with your pharmacist."],
  ["nsaid", "ginkgo", "caution", BLEEDING],
  ["stJohnsWort", "serotonergic", "avoid", SEROTONIN],
  ["serotoninSupplement", "serotonergic", "avoid", SEROTONIN],
  ["stJohnsWort", "serotoninSupplement", "caution", SEROTONIN],
  ["stJohnsWort", "contraceptive", "avoid", "St John's wort can make hormonal birth control less effective, which can lead to pregnancy. Use another option or talk to your doctor."],
  ["potassium", "potassiumRaising", "avoid", "This medicine already raises potassium. Adding a potassium supplement can push it too high, which affects the heart. Only take both if your doctor has said to."],
  ["statin", "redYeastRice", "avoid", "Red yeast rice contains the same active ingredient as some statins, so together it's like a double dose. Ask your doctor before combining them."],
  ["multivitamin", "iron", "overlap", "Most multivitamins already contain iron. Check the labels so your total stays within what your doctor recommends."],
  ["multivitamin", "vitaminA", "overlap", "Your multivitamin likely contains vitamin A too, and too much builds up in the body. Check the labels for your total."],
  ["multivitamin", "vitaminD", "overlap", "Your multivitamin likely contains vitamin D too. Check the labels so your daily total stays sensible."],
  ["multivitamin", "zinc", "overlap", "Your multivitamin likely contains zinc too. Long-term high zinc can lower copper, so check your total."],
];

const normalise = (name: string) => name.toLowerCase().replace(/[’`]/g, "'");

/** The built-in groups a name belongs to. */
export function groupsOf(name: string): string[] {
  const n = normalise(name);
  return Object.entries(GROUPS).filter(([, re]) => re.test(n)).map(([g]) => g);
}

/** Interactions from the built-in list, at most one per pair of items (the most serious). */
export function listFindings(names: string[]): Finding[] {
  const rank: Record<Severity, number> = { avoid: 0, caution: 1, timing: 2, overlap: 3 };
  const groups = names.map(groupsOf);
  const out: Finding[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const hits = RULES.filter(([a, b]) =>
        (groups[i].includes(a) && groups[j].includes(b)) || (groups[i].includes(b) && groups[j].includes(a)));
      if (!hits.length) continue;
      const [, , severity, advice] = hits.sort((x, y) => rank[x[2]] - rank[y[2]])[0];
      out.push({ items: [names[i], names[j]], severity, advice, source: "list" });
    }
  }
  return out;
}
