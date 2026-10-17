import { describe, expect, test } from "vitest";
import { extractStructured, isComplete, minutes, parseJsonLd, servings } from "./structured";

const page = (head: string, body = "") => `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
const ld = (data: unknown) => `<script type="application/ld+json">${typeof data === "string" ? data : JSON.stringify(data)}</script>`;
const URL_ = new URL("https://blog.example.com/recipes/curry/");

describe("JSON-LD variants", () => {
  test("Yoast-style @graph with @id references and HowToSection steps", () => {
    const html = page(ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": "https://blog.example.com/#website", name: "Example Kitchen" },
        { "@type": "Person", "@id": "https://blog.example.com/#/person/1", name: "Jane Cook" },
        { "@type": "ImageObject", "@id": "https://blog.example.com/#primaryimage", url: "https://blog.example.com/img/curry.jpg" },
        {
          "@type": "Recipe",
          name: "Weeknight Chicken Curry",
          author: { "@id": "https://blog.example.com/#/person/1" },
          image: { "@id": "https://blog.example.com/#primaryimage" },
          description: "A quick &amp; easy curry.",
          recipeYield: ["4", "4 servings"],
          prepTime: "PT10M",
          cookTime: "PT25M",
          totalTime: "PT35M",
          recipeIngredient: ["500g chicken thighs, diced", "1 tbsp curry powder", "400 ml coconut milk"],
          recipeInstructions: [
            { "@type": "HowToSection", name: "Marinade", itemListElement: [{ "@type": "HowToStep", text: "Toss the chicken with the curry powder." }] },
            {
              "@type": "HowToSection",
              name: "Cook",
              itemListElement: [
                { "@type": "HowToStep", text: "Brown the chicken." },
                { "@type": "HowToStep", text: "Add coconut milk and simmer for 20 minutes." },
              ],
            },
          ],
          nutrition: { "@type": "NutritionInformation", calories: "420 kcal", proteinContent: "32 g", carbohydrateContent: "8 g", fatContent: "28 g" },
          keywords: "curry, high protein, dinner",
          inLanguage: "en-AU",
        },
      ],
    }));
    const { recipe, stage } = extractStructured(html, URL_);
    expect(stage).toBe("json_ld");
    expect(recipe).toMatchObject({
      title: "Weeknight Chicken Curry",
      description: "A quick & easy curry.",
      author: "Jane Cook",
      image_url: "https://blog.example.com/img/curry.jpg",
      servings: 4,
      prep_time_min: 10,
      cook_time_min: 25,
      total_time_min: 35,
      steps: ["Marinade: Toss the chicken with the curry powder.", "Cook: Brown the chicken.", "Add coconut milk and simmer for 20 minutes."],
      nutrition: { calories: 420, protein: 32, carbs: 8, fat: 28 },
      language: "en",
      source_site: "blog.example.com",
      missing_fields: [],
      confidence: 1,
    });
    expect(recipe!.tags).toEqual(expect.arrayContaining(["chicken", "high-protein"]));
    expect(recipe!.ingredients[0]).toMatchObject({ raw_text: "500g chicken thighs, diced", quantity: 500, unit: "g", name: "chicken thighs", notes: "diced" });
  });

  test("type as an array, HTML instructions, image list, odd durations", () => {
    const html = page(ld({
      "@context": "http://schema.org/",
      "@type": ["Recipe", "NewsArticle"],
      name: "Banana Oat Pancakes",
      image: ["/img/pancakes-1x1.jpg", "/img/pancakes-16x9.jpg"],
      author: [{ "@type": "Person", name: "Sam" }, { "@type": "Person", name: "Alex" }],
      recipeYield: "Serves 2-3",
      totalTime: "P0DT0H15M",
      recipeIngredient: ["1 banana", "½ cup oats", "2 eggs"],
      recipeInstructions: "<ol><li>Mash the banana.</li><li>Stir in oats and eggs.</li><li>Fry spoonfuls for 2 minutes a side.</li></ol>",
      recipeCategory: "Breakfast",
      suitableForDiet: "https://schema.org/VegetarianDiet",
      publisher: { "@type": "Organization", name: "Pancake Weekly" },
    }));
    const { recipe } = extractStructured(html, URL_);
    expect(recipe).toMatchObject({
      image_url: "https://blog.example.com/img/pancakes-1x1.jpg",
      author: "Sam, Alex",
      servings: 2,
      total_time_min: 15,
      steps: ["Mash the banana.", "Stir in oats and eggs.", "Fry spoonfuls for 2 minutes a side."],
      source_site: "Pancake Weekly",
    });
    expect(recipe!.tags.sort()).toEqual(["breakfast", "eggs", "quick", "vegetarian"]);
  });

  test("CDATA wrapper, raw newlines in strings, ImageObject, numbered string steps, kJ", () => {
    const raw = `//<![CDATA[
{"@context":"https://schema.org","@type":"Recipe","name":"Miso Soup","image":{"@type":"ImageObject","url":"https://cdn.example.com/miso.jpg"},
"recipeIngredient":"2 cups dashi\n1 tbsp miso paste\n100g tofu",
"recipeInstructions":"1. Warm the dashi. 2. Whisk in the miso. 3. Add tofu and serve.",
"nutrition":{"calories":"420 kJ"}}
//]]>`;
    const { recipe } = extractStructured(page(ld(raw)), URL_);
    expect(recipe).toMatchObject({
      title: "Miso Soup",
      image_url: "https://cdn.example.com/miso.jpg",
      steps: ["Warm the dashi.", "Whisk in the miso.", "Add tofu and serve."],
      nutrition: { calories: 100, protein: null, carbs: null, fat: null },
    });
    expect(recipe!.ingredients.map((i) => i.raw_text)).toEqual(["2 cups dashi", "1 tbsp miso paste", "100g tofu"]);
  });

  test("ingredient group headings become groups, not ingredients", () => {
    const html = page(ld({ "@type": "Recipe", name: "Bibimbap", recipeIngredient: ["2 cups rice", "For the sauce:", "2 tbsp gochujang", "1 tsp sesame oil"], recipeInstructions: ["Cook rice.", "Mix sauce."] }));
    const { recipe } = extractStructured(html, URL_);
    expect(recipe!.ingredients.map((i) => [i.raw_text, i.group])).toEqual([["2 cups rice", null], ["2 tbsp gochujang", "sauce"], ["1 tsp sesame oil", "sauce"]]);
  });

  test("picks the complete recipe when a page has several", () => {
    const html = page(
      ld({ "@type": "Recipe", name: "Teaser", recipeIngredient: ["1 egg"] }) +
        ld({ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: { "@type": "Recipe", name: "Full Recipe", recipeIngredient: ["1 egg", "1 tsp salt"], recipeInstructions: ["Boil.", "Peel."] } }] }),
    );
    expect(extractStructured(html, URL_).recipe!.title).toBe("Full Recipe");
  });

  test("ignores broken JSON-LD blocks and other types", () => {
    const html = page(ld("{ not json") + ld({ "@type": "Article", name: "Not a recipe" }) + '<meta property="og:title" content="My Blog Post">');
    const out = extractStructured(html, URL_);
    expect(out.recipe).toBeNull();
    expect(out.meta.title).toBe("My Blog Post");
  });

  test("an incomplete recipe is returned but not complete", () => {
    const { recipe } = extractStructured(page(ld({ "@type": "Recipe", name: "Only a title", recipeIngredient: ["1 egg"] })), URL_);
    expect(isComplete(recipe)).toBe(false);
    expect(recipe!.missing_fields).toContain("steps");
    expect(recipe!.confidence).toBeLessThan(0.5);
  });
});

describe("Japanese and Korean pages", () => {
  test("Japanese recipe (Cookpad-style JSON-LD)", () => {
    const html = `<html lang="ja"><head>${ld({
      "@context": "http://schema.org",
      "@type": "Recipe",
      name: "簡単♪回鍋肉",
      author: { "@type": "Person", name: "わくわく" },
      recipeYield: "2人分",
      totalTime: "PT20M",
      recipeIngredient: ["豚肉（バラスライス） 150g", "キャベツ １／６個", "【合わせ調味料】", "甜麺醤 大さじ１", "醤油 小さじ２"],
      recipeInstructions: [{ "@type": "HowToStep", text: "調味料は合わせておく。" }, { "@type": "HowToStep", text: "豚肉を炒め、野菜を加える。" }],
    })}</head></html>`;
    const { recipe } = extractStructured(html, new URL("https://cookpad.com/jp/recipes/1"));
    expect(recipe).toMatchObject({ title: "簡単♪回鍋肉", servings: 2, total_time_min: 20, language: "ja", steps: ["調味料は合わせておく。", "豚肉を炒め、野菜を加える。"] });
    expect(recipe!.tags).toContain("pork");
    expect(recipe!.tags).toContain("quick");
    expect(recipe!.ingredients.map(({ name, quantity, unit, group }) => ({ name, quantity, unit, group }))).toEqual([
      { name: "豚肉", quantity: 150, unit: "g", group: null },
      { name: "キャベツ", quantity: 0.2, unit: "piece", group: null },
      { name: "甜麺醤", quantity: 15, unit: "ml", group: "合わせ調味料" },
      { name: "醤油", quantity: 10, unit: "ml", group: "合わせ調味料" },
    ]);
  });

  test("Korean recipe (만개의레시피-style JSON-LD with loose times)", () => {
    const html = `<html lang="ko"><head>${ld({
      "@context": "http://schema.org/",
      "@type": "Recipe",
      name: "간단 제육볶음",
      recipeYield: "2인분",
      totalTime: "30분 이내",
      recipeIngredient: ["돼지고기 앞다리살 300g", "양파 1/2개", "고추장 2큰술", "간장 1큰술"],
      recipeInstructions: [{ "@type": "HowToStep", text: "1. 양념장을 만듭니다." }, { "@type": "HowToStep", text: "2. 고기와 양파를 볶습니다." }],
    })}</head></html>`;
    const { recipe } = extractStructured(html, new URL("https://www.10000recipe.com/recipe/1"));
    expect(recipe).toMatchObject({ title: "간단 제육볶음", servings: 2, total_time_min: 30, language: "ko", steps: ["양념장을 만듭니다.", "고기와 양파를 볶습니다."] });
    expect(recipe!.tags).toContain("pork");
    expect(recipe!.ingredients[2]).toMatchObject({ name: "고추장", quantity: 30, unit: "ml" });
  });
});

describe("microdata fallback", () => {
  test("reads an itemscope Recipe", () => {
    const body = `
      <div itemscope itemtype="http://schema.org/Recipe">
        <h1 itemprop="name">Grandma's Lentil Soup</h1>
        <img itemprop="image" src="/soup.jpg">
        <span itemprop="author" itemscope itemtype="http://schema.org/Person"><span itemprop="name">Grandma</span></span>
        <meta itemprop="totalTime" content="PT45M">
        <span itemprop="recipeYield">6 servings</span>
        <ul><li itemprop="recipeIngredient">1 cup red lentils</li><li itemprop="recipeIngredient">1 onion, chopped</li></ul>
        <ol itemprop="recipeInstructions"><li>Soften the onion.</li><li>Add lentils and water; simmer 30 minutes.</li></ol>
      </div>`;
    const out = extractStructured(page("", body), URL_);
    expect(out.stage).toBe("microdata");
    expect(out.recipe).toMatchObject({
      title: "Grandma's Lentil Soup",
      author: "Grandma",
      image_url: "https://blog.example.com/soup.jpg",
      total_time_min: 45,
      servings: 6,
      steps: ["Soften the onion.", "Add lentils and water; simmer 30 minutes."],
    });
    expect(out.recipe!.ingredients.map((i) => i.name)).toEqual(["red lentils", "onion"]);
  });
});

describe("value helpers", () => {
  test.each([["PT1H30M", 90], ["PT20M", 20], ["P0DT2H", 120], ["PT0.5H", 30], ["1 hour 15 mins", 75], ["20分", 20], ["1時間", 60], ["45", 45], ["PT", null], ["soon", null]])(
    "minutes(%j) = %j",
    (input, expected) => expect(minutes(input)).toBe(expected),
  );
  test.each([[4, 4], ["4", 4], [["8", "8 cookies"], 8], ["Makes 12", 12], ["0", null], ["200", null]])("servings(%j) = %j", (input, expected) =>
    expect(servings(input as never)).toBe(expected),
  );
  test("parseJsonLd tolerates HTML comments", () => expect(parseJsonLd('<!-- {"a":1} -->')).toEqual({ a: 1 }));
});
