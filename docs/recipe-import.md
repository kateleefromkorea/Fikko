# Import a recipe from a URL

Members paste a link to a recipe page on the Recipes page (**Import from URL**). Fikko reads the recipe, shows it on the usual recipe form to check, and one tap saves it to the member's private library (under **Saved**), with credit and a link to the original.

## How it works

1. **Client:** `src/components/recipes/ImportRecipeDialog.tsx` → `src/lib/recipeImport.ts` → `POST /api/recipe-import`.
2. **Server:** `api/recipe-import.ts` checks the member and rate limit, normalises the URL (`_lib/recipeImport/url.ts`), and looks for:
   - a recipe the member already has from that page (by normalised URL), which it offers to open instead;
   - a cached result for that page (`recipe_import_cache`, 30 days).
3. **Pipeline** (`_lib/recipeImport/pipeline.ts`), tried in order:
   1. **Structured data** (`structured.ts`): schema.org `Recipe` JSON-LD, then microdata. This handles `@graph`/`@id` references, `HowToStep`/`HowToSection`, HTML or numbered string steps, ISO and loose durations, yields like "2人分", and nutrition.
   2. **AI fallback** (`content.ts` + `llm.ts`): when there's no complete structured recipe, the page's main text goes to Claude.
      - **Prepping the text:** navigation, ads, comments and sharing widgets are stripped, and the text is capped at 20,000 characters. Pages with under 200 characters of text are built by JavaScript and stop here.
      - **The call:** Claude Opus 5.5 at low effort, with a strict JSON schema (`output_config.format`) and `fallbacks: "default"` for refusals. The system prompt is cached.
      - **Checking the answer in code:**
        - Ingredient lines that don't appear on the page are dropped and flagged for a check.
        - Amounts come from our own parser reading the line as written.
        - Servings and calories are kept only when the page states them next to words like "serves", "人分", "인분" or "kcal".
      - **Gates and cost:** it needs the member's `ai_processing` consent, and it uses one AI credit only when a recipe comes back. Cost is logged to `ai_costs` as `recipe_import`.
   3. **Failure:** the member gets a message saying what went wrong and can type the recipe in on the same form, prefilled with whatever was found and still credited to the page.
4. **Ingredients** (`ingredients.ts`) are parsed into `{raw_text, quantity, unit, name, notes, group}`, with amounts converted to metric (g, ml). This covers English, Japanese (大さじ, 小さじ, カップ = 200 ml, 合) and Korean (큰술, 작은술, 컵 = 200 ml). `raw_text` is the line exactly as written, and it's what the app shows.
5. **Saving:** `saveImportedRecipe` in `src/lib/aiRecipes.ts` inserts into `ai_recipes` with `origin = 'imported'`. The photo is resized and re-encoded in the browser like a member's own upload, then stored in `recipe-photos`.

Imported recipes are private, like AI recipes. They never enter the member feed, so a blog's recipe is never republished.

New kinds of source (Instagram, TikTok, video) are added as another `RecipeSource` in `pipeline.ts`. Everything after extraction is shared.

## Safety

- **SSRF** (`safeFetch.ts`): only http and https on ports 80 and 443. Every resolved address is checked at connect time, which also stops DNS rebinding. Private, loopback, link-local, CGNAT, multicast, metadata and non-global IPv6 addresses are blocked. At most 5 redirects, each checked again. There's a 7 s deadline and a 4 MB cap on the decompressed size (3 MB and 4 s for images). Cookies and credentials are never sent.
- **Being a good citizen:** `User-Agent: FikkoBot/1.0 (+https://fikko.io; …)`. We honour `robots.txt` (cached for an hour per site), and we don't get around paywalls or logins: a 401, 402 or 403 tells the member the site needs a sign-in.
- **Abuse:** 6 imports a minute and 60 a day per member (`rate_limit`, migration 032). Results are cached by normalised URL.
- **Privacy:** logs are one JSON line per import: `{event, host, outcome, stage, reason, cached, confidence, ms}`. They never include page contents, the full URL or who asked.

## Setup

- Run `src/db/migrations/044_recipe_import.sql`. It's additive: existing AI recipes keep `origin = 'ai'`. Until it has run, imports still read pages but saving says the feature isn't switched on yet.
- **Env vars:** the existing `SUPABASE_SECRET_KEY` and `VITE_SUPABASE_URL` (or `SUPABASE_URL`), plus `ANTHROPIC_API_KEY` for the AI fallback. Without the key, pages lacking recipe data fail gracefully with the type-it-in option.
- **Timing:** `vercel.json` gives the function 60 s. Structured-data imports take 0.2 to 2 s. The AI fallback takes 7 to 12 s (live-tested on BBC Good Food, Cookpad and 만개의레시피) and costs about US$0.03 to 0.04 a page. Results are cached, so the same link is only read once. A synchronous request fits easily, so there's no job queue.
- **Model:** set in `MODEL` in `api/_lib/recipeImport/llm.ts`, with prices in `api/_lib/aiCost.ts`.
- **Tests:** `npm test` (vitest). They cover URL normalisation, the SSRF guard, robots.txt, the JSON-LD and microdata parser, ingredient parsing, content extraction, and AI extraction against English, Japanese and Korean fixture pages (with a stubbed client, so no API cost).

## Known limitations

- Pages that build their recipe with JavaScript and publish no structured data can't be read; the member gets the type-it-in form.
- Some sites' JSON-LD pads the steps with tips (Cookpad does this). Stage 1 keeps whatever the data says, while the AI stage follows the page's own numbered steps.
- Allergens are never guessed. Imported recipes show "Allergens not listed" until the member ticks them on the form.
- Meat and fish tags (used to warn vegetarians) come from ingredient keywords and can miss unusual names.
- Some sites give a social-share card rather than a food photo as their image.
- Prep and cook times and macros are kept only when the member leaves the total time and calories as imported.
