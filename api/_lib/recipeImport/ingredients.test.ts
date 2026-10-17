import { describe, expect, test } from "vitest";
import { groupHeading, parseIngredient, tidyLine } from "./ingredients";

const parts = (raw: string) => {
  const { quantity, unit, name, notes } = parseIngredient(raw);
  return { quantity, unit, name, notes };
};

describe("parseIngredient: amount first", () => {
  test.each([
    ["2 cups plain flour", { quantity: 480, unit: "ml", name: "plain flour", notes: null }],
    ["1/2 tsp baking soda", { quantity: 2.5, unit: "ml", name: "baking soda", notes: null }],
    ["1 1/2 tbsp light soy sauce", { quantity: 22.5, unit: "ml", name: "light soy sauce", notes: null }],
    ["½ cup milk", { quantity: 120, unit: "ml", name: "milk", notes: null }],
    ["200g chicken breast, thinly sliced", { quantity: 200, unit: "g", name: "chicken breast", notes: "thinly sliced" }],
    ["1 lb boneless, skin-on chicken thighs", { quantity: 454, unit: "g", name: "boneless, skin-on chicken thighs", notes: null }],
    ["4 ounces feta cheese", { quantity: 113, unit: "g", name: "feta cheese", notes: null }],
    ["3 large eggs", { quantity: 3, unit: null, name: "large eggs", notes: null }],
    ["2 garlic cloves", { quantity: 2, unit: null, name: "garlic cloves", notes: null }],
    ["2 cloves garlic, minced", { quantity: 2, unit: "clove", name: "garlic", notes: "minced" }],
    ["1 tbsp cornflour (or corn starch)", { quantity: 15, unit: "ml", name: "cornflour", notes: "or corn starch" }],
    ["1/2 tsp baking soda ((optional, Note 1))", { quantity: 2.5, unit: "ml", name: "baking soda", notes: "optional, Note 1" }],
    ["2-3 tbsp olive oil", { quantity: 30, unit: "ml", name: "olive oil", notes: null }],
    ["1.5 kg pork shoulder", { quantity: 1500, unit: "g", name: "pork shoulder", notes: null }],
  ])("%s", (raw, expected) => expect(parts(raw)).toEqual(expected));
});

describe("parseIngredient: Japanese", () => {
  test.each([
    ["醤油 大さじ2", { quantity: 30, unit: "ml", name: "醤油", notes: null }],
    ["砂糖 小さじ1/2", { quantity: 2.5, unit: "ml", name: "砂糖", notes: null }],
    ["水 1カップ", { quantity: 200, unit: "ml", name: "水", notes: null }],
    ["玉ねぎ 1/2個", { quantity: 0.5, unit: "piece", name: "玉ねぎ", notes: null }],
    ["きゃべつ １／６位", { quantity: 0.2, unit: null, name: "きゃべつ", notes: "位" }],
    ["ピーマン １～２個", { quantity: 1, unit: "piece", name: "ピーマン", notes: null }],
    ["豚肉（バラスライスやこまぎれ等） 150g", { quantity: 150, unit: "g", name: "豚肉", notes: "バラスライスやこまぎれ等" }],
    ["塩 少々", { quantity: null, unit: null, name: "塩", notes: "少々" }],
    ["米 2合", { quantity: 360, unit: "ml", name: "米", notes: null }],
  ])("%s", (raw, expected) => expect(parts(raw)).toEqual(expected));
});

describe("parseIngredient: Korean", () => {
  test.each([
    ["간장 2큰술", { quantity: 30, unit: "ml", name: "간장", notes: null }],
    ["설탕 1작은술", { quantity: 5, unit: "ml", name: "설탕", notes: null }],
    ["양파 1/2개", { quantity: 0.5, unit: "piece", name: "양파", notes: null }],
    ["물 1컵", { quantity: 200, unit: "ml", name: "물", notes: null }],
    ["밀가루박력분 110g", { quantity: 110, unit: "g", name: "밀가루박력분", notes: null }],
    ["다진 마늘 1T", { quantity: 15, unit: "ml", name: "다진 마늘", notes: null }],
    ["소금 약간", { quantity: null, unit: null, name: "소금", notes: "약간" }],
  ])("%s", (raw, expected) => expect(parts(raw)).toEqual(expected));
});

describe("parseIngredient: never loses the line", () => {
  test.each(["salt and pepper, to taste", "a handful of basil", "thumb-sized piece of ginger, grated", "🍋 zest"])("%s", (raw) => {
    const out = parseIngredient(raw, "Garnish");
    expect(out.raw_text).toBe(raw);
    expect(out.name.length).toBeGreaterThan(0);
    expect(out.group).toBe("Garnish");
  });

  test("salt and pepper, to taste keeps the note", () => {
    expect(parts("salt and pepper, to taste")).toEqual({ quantity: null, unit: null, name: "salt and pepper", notes: "to taste" });
  });
});

describe("groupHeading", () => {
  test.each([["For the sauce:", "sauce"], ["Marinade:", "Marinade"], ["【たれ】", "たれ"], ["■ソース", "ソース"], ["<양념장>", "양념장"]])(
    "%s",
    (line, group) => expect(groupHeading(line)).toBe(group),
  );
  test.each(["2 cups flour", "salt, to taste", "Ratio 1:2"])("%s is an ingredient", (line) => expect(groupHeading(line)).toBeNull());
});

describe("tidyLine: recipe plugin leftovers (RecipeTin Eats, WP Recipe Maker)", () => {
  test.each([
    ["3 cups (450g) flour (, bread or plain/all purpose (Note 1))", "3 cups (450g) flour (bread or plain/all purpose, Note 1)"],
    ["2 tsp instant or rapid rise yeast ((Note 2 for normal / active dry yeast))", "2 tsp instant or rapid rise yeast (Note 2 for normal / active dry yeast)"],
    ["1 1/2 tsp cooking salt / kosher salt (, HALVE if using table salt (Note 3))", "1 1/2 tsp cooking salt / kosher salt (HALVE if using table salt, Note 3)"],
    ["1 1/2 cups (375 ml) very warm tap water (, NOT boiling or super hot (ie up to 55°C/130°F) (Note 4))", "1 1/2 cups (375 ml) very warm tap water (NOT boiling or super hot (ie up to 55°C/130°F), Note 4)"],
    ["1 1/2 tbsp flour (, for dusting)", "1 1/2 tbsp flour (for dusting)"],
    ["180g (6oz ) chicken breast (, thinly sliced)", "180g (6oz) chicken breast (thinly sliced)"],
    ["2 cups flour", "2 cups flour"],
    ["豚肉（バラスライス） 150g", "豚肉（バラスライス） 150g"],
  ])("%s", (raw, tidy) => expect(tidyLine(raw)).toBe(tidy));

  test("parsing still finds the parts, and raw_text is the tidy line", () => {
    expect(parseIngredient("1 1/2 tbsp flour (, for dusting)")).toMatchObject({ raw_text: "1 1/2 tbsp flour (for dusting)", quantity: 22.5, unit: "ml", name: "flour", notes: "for dusting" });
  });
});

describe("parseIngredient: the author's metric amount wins", () => {
  test.each([
    ["3 cups (450g) flour (bread or plain/all purpose, Note 1)", { quantity: 450, unit: "g", name: "flour", notes: "bread or plain/all purpose, Note 1" }],
    ["1 1/2 cups (375 ml) very warm tap water", { quantity: 375, unit: "ml", name: "very warm tap water", notes: null }],
    ["1 lb (500 g) beef mince", { quantity: 500, unit: "g", name: "beef mince", notes: null }],
    ["2 cups (not packed) spinach", { quantity: 480, unit: "ml", name: "spinach", notes: "not packed" }],
  ])("%s", (raw, expected) => expect(parts(raw)).toEqual(expected));
});
