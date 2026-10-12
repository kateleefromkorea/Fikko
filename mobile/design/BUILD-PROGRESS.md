# Fikko Mobile redesign: build progress

Started 2026-10-11. Design reference: `prototype.html` in this folder (open it in a browser).
If a session stops part-way, start the next one with: "Continue the Fikko Mobile redesign from mobile/design/BUILD-PROGRESS.md".

## Decisions (from Kate)
- Core job: log anything in under 5 seconds. Same visual family as the website, native iOS feel. iPhone first.
- Keep every current feature; move or simplify, never cut.
- **No emoji.** Use the website's Fikko icon style: lucide glyphs on habit-hue tiles (`HabitIcon` in `src/components/HabitCard.tsx`).
- Teal/sky habit tones are locked (`.daily-overview`); never sage green.

## Structure
Tabs: **Today · Progress · (+) · Coach · Garden** (You opens from the profile initials in the top bar; Garden replaced the You tab on 2026-10-12)
- Today: date strip, plant hero (real `FikkoPlant`, streak, rain clouds, per-habit segments), "Up next" rows with one-tap actions, "Done" fold, "Add a habit". Tap a row → that habit's full web card in a sheet.
- (+) Capture sheet: voice check-in (big lead button), meals (opens the full food window: describe, photo, barcode, search), one-tap tiles (water, mood, meds, workout, sleep, custom +1).
- Progress: the web Dashboard ("Ask coach" jumps to Coach with the question).
- Coach: segmented Ask Fikko / Recipes.
- Garden: `MyFikkoView layout="garden"`, led by `GardenScene` (every harvested plant in the meadow, current plant in the front plot, a tree on the hills per complete month). Also reached by tapping the plant on Today. Icons: Today = Sun, Garden = Sprout.
- Trees (decided 2026-10-12): one real tree per calendar month with every day complete (rain-cloud days count); replaces the old tree-per-bloom. Shown from `treeMonths()` in `src/lib/fikko.ts`; server-side record of trees owed is still TODO.
- You (from the top-bar profile button): profile header, Profile & settings, Community (pushed pages with a back button), Sign out.
- All shared dialogs become bottom sheets on the phone (`mobile.css`, `[data-slot="dialog-content"]`).

## Shared with the website (2026-10-11)
The phone experience moved to `src/phone/` and is now what fikko.io shows on phones (under 768px) as well as the
app. `mobile/src` keeps only native concerns. See `AGENTS.md` ("Web, phone and mobile").

## Files (before the move to src/phone)
- `src/MobileApp.tsx` shell (tabs, shared day state, quick logging + toasts + plant hop, Android back button)
- `src/screens/TodayScreen.tsx`, `CoachScreen.tsx`, `YouScreen.tsx`
- `src/components/TabBar.tsx`, `CaptureSheet.tsx`, `PlantHero.tsx`, `Sheet.tsx`, `MealLogger.tsx`, `Toast.tsx`, `ScreenTitle.tsx`
- `src/lib/quickLog.ts` (one-tap logs in the same data shape as the web cards)
- `src/mobile.css`
- Removed `src/screens/HabitsScreen.tsx` (replaced by TodayScreen)

## Status (end of session 1, 2026-10-11)
- [x] Shell, tab bar, capture button, toasts, plant hop, Android back button
- [x] Today screen (hero, rows, one-tap actions, done fold, detail sheets)
- [x] Capture sheet (voice, meals, one-tap tiles)
- [x] Progress, Coach (Ask Fikko / Recipes), You (+ My Fikko, Profile & settings, Community pages)
- [x] All web dialogs render as bottom sheets; food window puts "Add food" first on the phone
- [x] Typecheck and build pass; no web (src/) files changed
- [x] Checked at 375x812 with the dev preview: `npm run dev` in mobile/, then http://localhost:5188/preview.html (sample data, no sign-in; `?empty` for a fresh day)
- [x] Emoji audit: none rendered. (`src/lib/metabolics.ts` has unused emoji fields; legacy custom habits that stored an emoji show Sparkles in mobile rows, but the web Custom habits card inside the sheet still shows the old emoji)

## Next
- [ ] Kate reviews on a real signed-in session / iOS Simulator (`npm run ios`)
- [ ] Polish: web page headers (eyebrow + big title) inside Progress / Coach duplicate the tab title; consider hiding them on the phone
- [ ] Swipe-down to dismiss sheets (currently Done, tap outside, or Escape)
- [ ] Haptics on one-tap logs (@capacitor/haptics) once on device
- [ ] Accessibility pass: VoiceOver order, Dynamic Type, contrast on frosted bars
- [ ] Commit (not committed yet; Kate to approve)

## Day complete animation (2026-10-12)
- `src/phone/DayComplete.tsx` + `.dc-*` rules in `phone.css` replace the web confetti on phones (web/desktop unchanged).
- Sequence: habit ring closes segment by segment → sun + rising seeds → streak number rolls over → today's leaf sprouts on the week strip → extras (rain cloud flies in every 7th day; plant grows into its new stage). Haptic on each beat. Tap skips; reduced motion shows the end state.
- Preview: `preview.html?celebrate&streak=N` (N full days before today: 0 first day, 2 sprout, 6 rain cloud, 9 sapling, 20 both).
- [ ] Feel the haptic rhythm on a real iPhone (ticks per segment may be too busy with 8+ habits)
