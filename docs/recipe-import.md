# Import a recipe from a URL

Members paste a link to a recipe page on the Recipes page (**Import from URL**). Fikko reads the recipe, shows it on the usual recipe form to check, and one tap saves it to the member's private library (under **Saved**), with credit and a link to the original.

## How it works

1. **Client:** `src/components/recipes/ImportRecipeDialog.tsx` → `src/lib/recipeImport.ts` → `POST /api/recipe-import`.
2. **Server:** `api/recipe-import.ts` checks the member and rate limit, normalises the URL (`_lib/recipeImport/url.ts`), and looks for:
   - a recipe the member already has from that page (by normalised URL), which it offers to open instead;
   - a cached result for that page (`recipe_import_cache`, 30 days).
3. **Pipeline** (`_lib/recipeImport/pipeline.ts`), tried in order:
   1. **Structured data** (`structured.ts`): schema.org `Recipe` JSON-LD, then microdata. This handles `@graph`/`@id` references, `HowToStep`/`HowToSection`, HTML or numbered string steps, ISO and loose durations, yields like "2人分", and nutrition.
   2. **AI fallback:** Stage 2, not built yet.
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
- **Env vars:** the existing `SUPABASE_SECRET_KEY` and `VITE_SUPABASE_URL` (or `SUPABASE_URL`). Stage 2 will use `ANTHROPIC_API_KEY`.
- `vercel.json` gives the function 60 s, which is plenty, since a typical import takes 0.2 to 2 s.
- **Tests:** `npm test` (vitest), covering URL normalisation, the SSRF guard, robots.txt, the JSON-LD and microdata parser, and ingredient parsing.

## Known limitations

- Pages that build their recipe with JavaScript and publish no structured data aren't readable until the AI fallback (Stage 2) lands.
- Allergens are never guessed. Imported recipes show "Allergens not listed" until the member ticks them on the form.
- Meat and fish tags (used to warn vegetarians) come from ingredient keywords and can miss unusual names.
- Some sites give a social-share card rather than a food photo as their image.
- Prep and cook times and macros are kept only when the member leaves the total time and calories as imported.
